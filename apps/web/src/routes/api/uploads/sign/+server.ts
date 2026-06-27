import {
	asPartNumbers,
	asString,
	guardUpload,
	isValidVideoKey,
	readJson
} from '$lib/server/multipart';
import { json } from '@sveltejs/kit';
import { presignUploadParts } from '@vitruvius/db';
import type { RequestHandler } from './$types';

// How long a presigned part URL stays valid. The client signs each part just before uploading it
// (see uploadParts), so this only has to outlive a single part's transfer — generous here so a slow
// mobile connection moving one ~64MB part can't hit the limit. Total upload time is unbounded.
const PART_URL_TTL_S = 3600;

// Presign PUT URLs for the requested part numbers of an in-progress multipart upload (spec 20).
export const POST: RequestHandler = async (event) => {
	const blocked = guardUpload(event);
	if (blocked) return blocked;

	const body = await readJson(event.request);
	const key = asString(body?.key);
	const uploadId = asString(body?.uploadId);
	const partNumbers = asPartNumbers(body?.partNumbers);
	if (!key || !uploadId || !partNumbers || !isValidVideoKey(key)) {
		return json({ error: 'key, uploadId and partNumbers are required' }, { status: 400 });
	}

	try {
		const parts = await presignUploadParts(key, uploadId, partNumbers, PART_URL_TTL_S);
		return json({ parts });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'unknown error';
		return json({ error: `could not sign parts: ${message}` }, { status: 502 });
	}
};
