import {
	AbortMultipartUploadCommand,
	CompleteMultipartUploadCommand,
	CreateMultipartUploadCommand,
	DeleteObjectsCommand,
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
	UploadPartCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { DbClient } from './client.js';

// Source videos are large (hundreds of MB) and exceed Supabase Storage's per-file
// upload cap on the free plan. They live in Cloudflare R2 (S3-compatible, no such
// cap, zero egress) instead. R2 holds only the video; the small BOM/CAD aux files
// and the exported PDFs stay on Supabase Storage. When R2 is not configured the
// helpers fall back to the Supabase `videos` bucket, so local dev and tests keep
// working without R2 credentials.
const VIDEO_BUCKET = 'videos';
const DEFAULT_SIGNED_URL_TTL_S = 600;

type R2Env = Record<string, string | undefined>;

type R2Config = {
	accountId: string;
	accessKeyId: string;
	secretAccessKey: string;
	bucket: string;
};

function readR2Config(env: R2Env): R2Config | null {
	const accountId = env.R2_ACCOUNT_ID;
	const accessKeyId = env.R2_ACCESS_KEY_ID;
	const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
	const bucket = env.R2_BUCKET;
	if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
	return { accountId, accessKeyId, secretAccessKey, bucket };
}

/** True when all four R2 env vars are present, so video storage uses R2 rather than Supabase. */
export function isR2Configured(env: R2Env = process.env): boolean {
	return readR2Config(env) !== null;
}

let cachedClient: S3Client | null = null;

function r2Client(config: R2Config): S3Client {
	if (cachedClient) return cachedClient;
	cachedClient = new S3Client({
		region: 'auto',
		endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
		// Path-style keeps the bucket in the URL path (not a host subdomain), which is
		// the reliable form for R2 and for deterministic presigned URLs.
		forcePathStyle: true,
		credentials: {
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey
		}
	});
	return cachedClient;
}

/**
 * Upload a source video. Uses R2 when configured (no per-file size cap), else the
 * Supabase `videos` bucket. Throws on failure; the caller is responsible for rollback.
 */
export async function uploadVideo(
	db: DbClient,
	key: string,
	body: Buffer,
	contentType: string,
	env: R2Env = process.env
): Promise<void> {
	const config = readR2Config(env);
	if (config) {
		await r2Client(config).send(
			new PutObjectCommand({
				Bucket: config.bucket,
				Key: key,
				Body: body,
				ContentType: contentType,
				ContentLength: body.byteLength
			})
		);
		return;
	}

	const { error } = await db.storage.from(VIDEO_BUCKET).upload(key, body, { contentType });
	if (error) throw new Error(`video upload failed for ${key}: ${error.message}`);
}

/** Resolve a video object key to a fetchable, time-limited URL (R2 or Supabase). */
export async function presignVideoGet(
	db: DbClient,
	key: string,
	ttlSeconds: number = DEFAULT_SIGNED_URL_TTL_S,
	env: R2Env = process.env
): Promise<string> {
	const config = readR2Config(env);
	if (config) {
		return getSignedUrl(
			r2Client(config),
			new GetObjectCommand({ Bucket: config.bucket, Key: key }),
			{ expiresIn: ttlSeconds }
		);
	}

	const { data, error } = await db.storage.from(VIDEO_BUCKET).createSignedUrl(key, ttlSeconds);
	if (error || !data?.signedUrl) {
		throw new Error(`sign video url failed for ${key}: ${error?.message ?? 'no url returned'}`);
	}
	return data.signedUrl;
}

/** Best-effort delete of video objects (rollback on a failed upload flow). */
export async function deleteVideo(
	db: DbClient,
	keys: string[],
	env: R2Env = process.env
): Promise<void> {
	if (keys.length === 0) return;
	const config = readR2Config(env);
	// Best-effort: this runs on rollback paths, so a delete failure must never throw and
	// mask the original upload error (turning a clean fail(502) into an unhandled 500).
	try {
		if (config) {
			await r2Client(config).send(
				new DeleteObjectsCommand({
					Bucket: config.bucket,
					Delete: { Objects: keys.map((Key) => ({ Key })) }
				})
			);
		} else {
			await db.storage.from(VIDEO_BUCKET).remove(keys);
		}
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		console.warn(`[storage] best-effort video delete failed for ${keys.join(', ')}: ${reason}`);
	}
}

// --- Direct browser→R2 multipart upload (spec 20) -------------------------------------------
//
// These helpers let the browser PUT the video bytes straight to R2 in parts, so a multi-GB
// video never passes through (or buffers in) the web server. They are R2-only: a single
// presigned PutObject tops out near R2's ~5GB limit, and Supabase Storage has no S3-compatible
// multipart API. When R2 is unconfigured the web app keeps the server-proxied `uploadVideo`
// path instead (graceful fallback), so these are never called without R2 credentials.

/** Presigned PUT URL for one part of a multipart upload. */
export type PartSignature = { partNumber: number; url: string };

/** A finished part: its number plus the ETag R2 returned from the PUT, needed to complete. */
export type CompletedPart = { partNumber: number; etag: string };

/** Lightweight metadata for an object that already exists in storage. */
export type VideoHead = { size: number; contentType: string };

function requireR2Config(env: R2Env): R2Config {
	const config = readR2Config(env);
	if (!config) throw new Error('R2 is not configured; multipart upload is unavailable');
	return config;
}

/** Start a multipart upload and return its upload id (needed to sign and complete parts). */
export async function createMultipartUpload(
	key: string,
	contentType: string,
	env: R2Env = process.env
): Promise<string> {
	const config = requireR2Config(env);
	const out = await r2Client(config).send(
		new CreateMultipartUploadCommand({ Bucket: config.bucket, Key: key, ContentType: contentType })
	);
	if (!out.UploadId) throw new Error(`R2 did not return an upload id for ${key}`);
	return out.UploadId;
}

/** Presign PUT URLs for the given part numbers so the browser can upload each part directly. */
export async function presignUploadParts(
	key: string,
	uploadId: string,
	partNumbers: number[],
	ttlSeconds: number = DEFAULT_SIGNED_URL_TTL_S,
	env: R2Env = process.env
): Promise<PartSignature[]> {
	const config = requireR2Config(env);
	const client = r2Client(config);
	return Promise.all(
		partNumbers.map(async (partNumber) => ({
			partNumber,
			url: await getSignedUrl(
				client,
				new UploadPartCommand({
					Bucket: config.bucket,
					Key: key,
					UploadId: uploadId,
					PartNumber: partNumber
				}),
				{ expiresIn: ttlSeconds }
			)
		}))
	);
}

/** Complete a multipart upload, assembling the parts (in order) into the final object. */
export async function completeMultipartUpload(
	key: string,
	uploadId: string,
	parts: CompletedPart[],
	env: R2Env = process.env
): Promise<void> {
	const config = requireR2Config(env);
	await r2Client(config).send(
		new CompleteMultipartUploadCommand({
			Bucket: config.bucket,
			Key: key,
			UploadId: uploadId,
			MultipartUpload: {
				Parts: [...parts]
					.sort((a, b) => a.partNumber - b.partNumber)
					.map(({ partNumber, etag }) => ({ PartNumber: partNumber, ETag: etag }))
			}
		})
	);
}

/** Best-effort abort of a multipart upload (client cancel/error), so parts aren't billed. */
export async function abortMultipartUpload(
	key: string,
	uploadId: string,
	env: R2Env = process.env
): Promise<void> {
	const config = readR2Config(env);
	if (!config) return;
	try {
		await r2Client(config).send(
			new AbortMultipartUploadCommand({ Bucket: config.bucket, Key: key, UploadId: uploadId })
		);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		console.warn(`[storage] best-effort multipart abort failed for ${key}: ${reason}`);
	}
}

/** Read size + content type of a video object, or null if it does not exist (R2 only). */
export async function headVideo(key: string, env: R2Env = process.env): Promise<VideoHead | null> {
	const config = requireR2Config(env);
	try {
		const out = await r2Client(config).send(
			new HeadObjectCommand({ Bucket: config.bucket, Key: key })
		);
		return {
			size: out.ContentLength ?? 0,
			contentType: out.ContentType ?? 'application/octet-stream'
		};
	} catch (error) {
		// A missing object surfaces as a 404; treat that as "not there" rather than an error so
		// callers can return a clean validation failure. Prefer the HTTP status from `$metadata`
		// (reliable across SDK/provider versions) and fall back to the error name.
		const status = (error as { $metadata?: { httpStatusCode?: number } } | undefined)?.$metadata
			?.httpStatusCode;
		const name = error instanceof Error ? error.name : '';
		if (status === 404 || name === 'NotFound' || name === 'NoSuchKey') return null;
		throw error;
	}
}
