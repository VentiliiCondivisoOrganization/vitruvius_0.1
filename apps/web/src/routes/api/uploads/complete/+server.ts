import {
	asCompletedParts,
	asString,
	guardUpload,
	isValidVideoKey,
	readJson
} from '$lib/server/multipart';
import { json } from '@sveltejs/kit';
import { completeMultipartUpload } from '@vitruvius/db';
import type { RequestHandler } from './$types';

// Assemble the uploaded parts into the final R2 object (spec 20). After this succeeds the client
// submits the upload form action with the object key to create the manual.
export const POST: RequestHandler = async (event) => {
	const blocked = guardUpload(event);
	if (blocked) return blocked;

	const body = await readJson(event.request);
	const key = asString(body?.key);
	const uploadId = asString(body?.uploadId);
	const parts = asCompletedParts(body?.parts);
	if (!key || !uploadId || !parts || !isValidVideoKey(key)) {
		return json({ error: 'key, uploadId and parts are required' }, { status: 400 });
	}

	try {
		await completeMultipartUpload(key, uploadId, parts);
		return json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'unknown error';
		return json({ error: `could not complete upload: ${message}` }, { status: 502 });
	}
};
