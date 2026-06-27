import { m } from '$lib/paraglide/messages';
import { checkAuxSizes, checkUploadQuota, checkVideoSize } from '$lib/server/limits';
import { VIDEO_BUCKET, readAuxFiles, storageKey, uploadAuxFiles } from '$lib/server/uploads';
import { fail, redirect } from '@sveltejs/kit';
import type { InstructionManual } from '@vitruvius/core';
import {
	deleteManual,
	deleteVideo,
	enqueueJob,
	getManuals,
	saveManual,
	uploadVideo
} from '@vitruvius/db';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const manuals = await getManuals(locals.db);
	return { manuals };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		const file = form.get('video');

		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { error: m.error_choose_video() });
		}
		if (!file.type.startsWith('video/')) {
			return fail(400, { error: m.error_not_a_video() });
		}

		// Abuse guardrails: reject oversized files before buffering, and flood uploads
		// before doing any storage work (see $lib/server/limits + @vitruvius/core).
		const videoTooLarge = checkVideoSize(file);
		if (videoTooLarge) return fail(413, videoTooLarge);

		const aux = readAuxFiles(form);
		if ('error' in aux) return fail(400, { error: aux.error });

		const auxTooLarge = checkAuxSizes(aux);
		if (auxTooLarge) return fail(413, auxTooLarge);

		const overQuota = await checkUploadQuota(locals.db);
		if (overQuota) return fail(429, overQuota);

		const id = crypto.randomUUID();
		const videoPath = storageKey(id, file.name, 'source');

		// The video goes to R2 (no per-file size cap); BOM/CAD aux files stay on Supabase.
		try {
			const body = Buffer.from(await file.arrayBuffer());
			await uploadVideo(locals.db, videoPath, body, file.type);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'unknown error';
			return fail(502, { error: m.error_upload_failed({ message }) });
		}

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
			title: file.name,
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
