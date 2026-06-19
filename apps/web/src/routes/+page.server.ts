import { fail, redirect } from '@sveltejs/kit';
import type { InstructionManual } from '@vitruvius/core';
import { enqueueJob, saveManual } from '@vitruvius/db';
import type { Actions } from './$types';

const VIDEO_BUCKET = 'videos';

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

		// The manual id is the storage prefix, so the row and the object stay linked.
		const id = crypto.randomUUID();
		const path = `${id}/${file.name}`;

		const { error: uploadError } = await locals.db.storage
			.from(VIDEO_BUCKET)
			.upload(path, file, { contentType: file.type });

		if (uploadError) {
			return fail(502, { error: `Upload failed: ${uploadError.message}` });
		}

		const now = new Date().toISOString();
		const manual: InstructionManual = {
			id,
			title: file.name,
			videoUrl: path,
			status: 'uploaded',
			steps: [],
			createdAt: now,
			updatedAt: now
		};

		await saveManual(locals.db, manual);
		await enqueueJob(locals.db, { manualId: id, type: 'process' });

		redirect(303, `/manuals/${id}`);
	}
};
