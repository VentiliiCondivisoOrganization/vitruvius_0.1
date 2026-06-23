import { VIDEO_BUCKET, readAuxFiles, storageKey, uploadAuxFiles } from '$lib/server/uploads';
import { fail, redirect } from '@sveltejs/kit';
import type { InstructionManual } from '@vitruvius/core';
import { deleteManual, enqueueJob, saveManual } from '@vitruvius/db';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		const file = form.get('video');

		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { error: 'Choose a video file to upload.' });
		}
		if (!file.type.startsWith('video/')) {
			return fail(400, { error: 'That file is not a video.' });
		}

		const aux = readAuxFiles(form);
		if ('error' in aux) return fail(400, { error: aux.error });

		const id = crypto.randomUUID();
		const videoPath = storageKey(id, file.name, 'source');

		const { error: uploadError } = await locals.db.storage
			.from(VIDEO_BUCKET)
			.upload(videoPath, file, { contentType: file.type });

		if (uploadError) {
			return fail(502, { error: `Upload failed: ${uploadError.message}` });
		}

		const auxUpload = await uploadAuxFiles(locals.db, id, aux);
		if ('error' in auxUpload) {
			// The aux helper cleaned up its own writes; roll back the video too.
			await locals.db.storage.from(VIDEO_BUCKET).remove([videoPath]);
			return fail(502, { error: auxUpload.error });
		}
		const { bomFileUrl, digitalModelUrl } = auxUpload;
		const uploadedPaths = [videoPath, ...auxUpload.uploadedPaths];

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
				locals.db.storage.from(VIDEO_BUCKET).remove(uploadedPaths)
			]);
			const message = err instanceof Error ? err.message : 'unknown error';
			return fail(500, { error: `Could not start processing: ${message}` });
		}

		redirect(303, `/manuals/${id}`);
	}
};
