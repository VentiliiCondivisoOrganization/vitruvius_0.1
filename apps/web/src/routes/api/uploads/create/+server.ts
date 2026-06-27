import { checkVideoBytes } from '$lib/server/limits';
import {
	asPositiveInt,
	asString,
	computePartPlan,
	guardUpload,
	readJson
} from '$lib/server/multipart';
import { storageKey } from '$lib/server/uploads';
import { json } from '@sveltejs/kit';
import { createMultipartUpload } from '@vitruvius/db';
import type { RequestHandler } from './$types';

// Start a direct browser→R2 multipart upload for a source video (spec 20). Returns the manual
// id + object key the finalise action will reuse, the upload id, and the part plan the client
// chunks the file by. The bytes never pass through this server.
export const POST: RequestHandler = async (event) => {
	const blocked = guardUpload(event);
	if (blocked) return blocked;

	const body = await readJson(event.request);
	const filename = asString(body?.filename);
	const contentType = asString(body?.contentType);
	const size = asPositiveInt(body?.size);
	if (!filename || !contentType || size === null) {
		return json({ error: 'filename, contentType and size are required' }, { status: 400 });
	}
	if (!contentType.startsWith('video/')) {
		return json({ error: 'file must be a video' }, { status: 400 });
	}
	// Early reject on the client's declared size (re-verified authoritatively at finalise) so an
	// over-limit video fails before the upload starts rather than after.
	const tooLarge = checkVideoBytes(size);
	if (tooLarge) return json(tooLarge, { status: 413 });

	const id = crypto.randomUUID();
	const key = storageKey(id, filename, 'source');
	const { partSize, partCount } = computePartPlan(size);

	try {
		const uploadId = await createMultipartUpload(key, contentType);
		return json({ id, key, uploadId, partSize, partCount });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'unknown error';
		return json({ error: `could not start upload: ${message}` }, { status: 502 });
	}
};
