import type { DbClient } from '@vitruvius/db';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';

const VIDEO_BUCKET = 'videos';
const SIGNED_URL_TTL_S = 600;

/** Resolve a Storage object key to a fetchable URL (already-absolute URLs pass through). */
export async function resolveStorageUrl(db: DbClient, objectKey: string): Promise<string> {
	if (/^https?:\/\//.test(objectKey)) return objectKey;

	const { data, error } = await db.storage
		.from(VIDEO_BUCKET)
		.createSignedUrl(objectKey, SIGNED_URL_TTL_S);
	if (error || !data?.signedUrl) {
		throw new Error(
			`sign storage url failed for ${objectKey}: ${error?.message ?? 'no url returned'}`
		);
	}
	return data.signedUrl;
}

export async function downloadStorageObject(url: string, destPath: string): Promise<void> {
	const res = await fetch(url);
	if (!res.ok || !res.body) {
		throw new Error(`download failed (${res.status}) for ${url}`);
	}
	const webStream = res.body as unknown as NodeWebReadableStream<Uint8Array>;
	await pipeline(Readable.fromWeb(webStream), createWriteStream(destPath));
}

/** Download an optional object; returns false (without touching disk) when the key is blank. */
export async function maybeDownload(
	db: DbClient,
	objectKey: string,
	destPath: string
): Promise<boolean> {
	if (!objectKey.trim()) return false;
	await downloadStorageObject(await resolveStorageUrl(db, objectKey), destPath);
	return true;
}
