import { m } from '$lib/paraglide/messages';
import {
	checkAuxSizes,
	checkUploadQuota,
	checkVideoBytes,
	checkVideoSize
} from '$lib/server/limits';
import { isValidVideoKey } from '$lib/server/multipart';
import { VIDEO_BUCKET, readAuxFiles, storageKey, uploadAuxFiles } from '$lib/server/uploads';
import { fail, redirect } from '@sveltejs/kit';
import type { InstructionManual } from '@vitruvius/core';
import {
	deleteManual,
	deleteVideo,
	enqueueJob,
	getManuals,
	headVideo,
	isR2Configured,
	saveManual,
	uploadVideo
} from '@vitruvius/db';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const manuals = await getManuals(locals.db);
	// When R2 is configured the browser uploads the video directly to R2 (spec 20); otherwise it
	// falls back to the server-proxied form action. The client branches on this flag.
	return { manuals, directUpload: isR2Configured() };
};

/**
 * Resolve the source video for this submission into an `(id, videoPath, title)` triple.
 *
 * Two paths share the action:
 *  - **Direct upload (spec 20):** the browser already PUT the bytes to R2 and submits the object
 *    `videoKey`. We verify the object actually exists (and is a video) before trusting it, so a
 *    client can't register a key it never uploaded.
 *  - **Server-proxied (fallback, no R2):** the `video` File rides in the form; we buffer it and
 *    upload it ourselves, as before.
 */
type ResolvedVideo = { id: string; videoPath: string; title: string };
type ResolveError = { status: number; error: string };

async function resolveVideo(
	form: FormData,
	db: App.Locals['db']
): Promise<ResolveError | ResolvedVideo> {
	const videoKey = form.get('videoKey');
	if (typeof videoKey === 'string' && videoKey.length > 0) {
		if (!isValidVideoKey(videoKey)) return { status: 400, error: m.error_choose_video() };
		const head = await headVideo(videoKey).catch(() => null);
		if (!head || head.size === 0) return { status: 400, error: m.error_choose_video() };
		if (!head.contentType.startsWith('video/'))
			return { status: 400, error: m.error_not_a_video() };
		// Authoritative size cap on the object actually in R2 (the client's declared size at /create
		// was advisory). 413 mirrors the fallback path.
		const tooLarge = checkVideoBytes(head.size);
		if (tooLarge) return { status: 413, error: tooLarge.error };
		const id = videoKey.split('/')[0];
		const videoName = form.get('videoName');
		const title = typeof videoName === 'string' && videoName.length > 0 ? videoName : id;
		return { id, videoPath: videoKey, title };
	}

	// Fallback: the video bytes are in the form (no R2 / local dev).
	const file = form.get('video');
	if (!(file instanceof File) || file.size === 0)
		return { status: 400, error: m.error_choose_video() };
	if (!file.type.startsWith('video/')) return { status: 400, error: m.error_not_a_video() };
	const tooLarge = checkVideoSize(file);
	if (tooLarge) return { status: 413, error: tooLarge.error };

	const id = crypto.randomUUID();
	const videoPath = storageKey(id, file.name, 'source');
	try {
		const body = Buffer.from(await file.arrayBuffer());
		await uploadVideo(db, videoPath, body, file.type);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'unknown error';
		return { status: 502, error: m.error_upload_failed({ message }) };
	}
	return { id, videoPath, title: file.name };
}

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();

		// Abuse guardrails: reject oversized aux files and flood uploads before doing any
		// storage or job-enqueue work (see $lib/server/limits + @vitruvius/core). The video
		// size is enforced inside resolveVideo (and early, on declared size, at /api/uploads/create).
		const aux = readAuxFiles(form);
		if ('error' in aux) return fail(400, { error: aux.error });

		const auxTooLarge = checkAuxSizes(aux);
		if (auxTooLarge) return fail(413, auxTooLarge);

		const overQuota = await checkUploadQuota(locals.db);
		if (overQuota) return fail(429, overQuota);

		// The video is already in R2 (direct upload, spec 20) or is buffered+uploaded here as a
		// fallback. Either way we end up with an object key; BOM/CAD aux files stay on Supabase.
		const video = await resolveVideo(form, locals.db);
		if ('error' in video) return fail(video.status, { error: video.error });
		const { id, videoPath, title } = video;

		const auxUpload = await uploadAuxFiles(locals.db, id, aux);
		if ('error' in auxUpload) {
			// The aux helper cleaned up its own writes; roll back the video too.
			await deleteVideo(locals.db, [videoPath]);
			return fail(502, { error: auxUpload.error });
		}
		const { bomFileUrl, digitalModelUrl } = auxUpload;
		const auxPaths = auxUpload.uploadedPaths;

		const now = new Date().toISOString();
		const manual: InstructionManual = {
			id,
			title,
			videoUrl: videoPath,
			bomFileUrl,
			digitalModelUrl,
			status: 'uploaded',
			steps: [],
			bom: [],
			version: 1,
			parentVersionId: null,
			createdAt: now,
			updatedAt: now
		};

		try {
			await saveManual(locals.db, manual);
			await enqueueJob(locals.db, { manualId: id, type: 'process' });
		} catch (err) {
			await Promise.allSettled([
				deleteManual(locals.db, id),
				deleteVideo(locals.db, [videoPath]),
				auxPaths.length ? locals.db.storage.from(VIDEO_BUCKET).remove(auxPaths) : Promise.resolve()
			]);
			const message = err instanceof Error ? err.message : 'unknown error';
			return fail(500, { error: m.error_could_not_start_processing({ message }) });
		}

		redirect(303, `/manuals/${id}`);
	}
};
