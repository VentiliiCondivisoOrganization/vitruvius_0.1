import { asString, guardUpload, isValidVideoKey, readJson } from '$lib/server/multipart';
import { json } from '@sveltejs/kit';
import { abortMultipartUpload } from '@vitruvius/db';
import type { RequestHandler } from './$types';

// Best-effort abort of a multipart upload the client gave up on (spec 20), so R2 doesn't bill
// for orphaned parts. Always reports success — abort is cleanup, not a user-facing failure.
export const POST: RequestHandler = async (event) => {
	const blocked = guardUpload(event);
	if (blocked) return blocked;

	const body = await readJson(event.request);
	const key = asString(body?.key);
	const uploadId = asString(body?.uploadId);
	if (!key || !uploadId || !isValidVideoKey(key)) {
		return json({ error: 'key and uploadId are required' }, { status: 400 });
	}

	await abortMultipartUpload(key, uploadId);
	return json({ ok: true });
};
