import {
	DeleteObjectsCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client
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
