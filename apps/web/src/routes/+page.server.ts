import { fail, redirect } from '@sveltejs/kit';
import type { InstructionManual } from '@vitruvius/core';
import { deleteManual, enqueueJob, saveManual } from '@vitruvius/db';
import type { Actions } from './$types';

const VIDEO_BUCKET = 'videos';

function storageKey(id: string, filename: string, prefix: string): string {
	const ext =
		filename
			.split('.')
			.pop()
			?.toLowerCase()
			.replace(/[^a-z0-9]/g, '') ?? '';
	return ext ? `${id}/${prefix}.${ext}` : `${id}/${prefix}`;
}

function optionalFile(form: FormData, field: string): File | null {
	const file = form.get(field);
	if (!(file instanceof File) || file.size === 0) return null;
	return file;
}

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

		const bomFile = optionalFile(form, 'bom');
		if (bomFile && !bomFile.name.toLowerCase().endsWith('.csv')) {
			return fail(400, { error: 'BOM file must be a CSV.' });
		}

		const modelFile = optionalFile(form, 'model');
		if (modelFile) {
			const lower = modelFile.name.toLowerCase();
			const ok = ['.step', '.stp', '.obj', '.stl'].some((ext) => lower.endsWith(ext));
			if (!ok) {
				return fail(400, { error: 'Digital model must be STEP, OBJ, or STL.' });
			}
		}

		const id = crypto.randomUUID();
		const videoPath = storageKey(id, file.name, 'source');
		const uploadedPaths: string[] = [videoPath];

		const { error: uploadError } = await locals.db.storage
			.from(VIDEO_BUCKET)
			.upload(videoPath, file, { contentType: file.type });

		if (uploadError) {
			return fail(502, { error: `Upload failed: ${uploadError.message}` });
		}

		let bomFileUrl = '';
		if (bomFile) {
			bomFileUrl = storageKey(id, bomFile.name, 'bom');
			uploadedPaths.push(bomFileUrl);
			const { error } = await locals.db.storage
				.from(VIDEO_BUCKET)
				.upload(bomFileUrl, bomFile, { contentType: 'text/csv' });
			if (error) {
				await locals.db.storage.from(VIDEO_BUCKET).remove(uploadedPaths);
				return fail(502, { error: `BOM upload failed: ${error.message}` });
			}
		}

		let digitalModelUrl = '';
		if (modelFile) {
			digitalModelUrl = storageKey(id, modelFile.name, 'model');
			uploadedPaths.push(digitalModelUrl);
			const { error } = await locals.db.storage
				.from(VIDEO_BUCKET)
				.upload(digitalModelUrl, modelFile, {
					contentType: modelFile.type || 'application/octet-stream'
				});
			if (error) {
				await locals.db.storage.from(VIDEO_BUCKET).remove(uploadedPaths);
				return fail(502, { error: `Model upload failed: ${error.message}` });
			}
		}

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
