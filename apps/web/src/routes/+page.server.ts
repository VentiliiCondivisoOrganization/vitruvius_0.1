import { fail, redirect } from '@sveltejs/kit';
import type { InstructionManual } from '@vitruvius/core';
import { deleteManual, enqueueJob, saveManual } from '@vitruvius/db';
import type { Actions } from './$types';

const VIDEO_BUCKET = 'videos';

// A storage key we control, derived only from the manual id plus a sanitized
// extension — never from the raw (user-controlled) filename, which could contain
// path separators or odd characters. The original name is kept as the title.
function storageKey(id: string, filename: string): string {
	const ext =
		filename
			.split('.')
			.pop()
			?.toLowerCase()
			.replace(/[^a-z0-9]/g, '') ?? '';
	return ext ? `${id}/source.${ext}` : `${id}/source`;
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

		const id = crypto.randomUUID();
		const path = storageKey(id, file.name);

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

		try {
			await saveManual(locals.db, manual);
			await enqueueJob(locals.db, { manualId: id, type: 'process' });
		} catch (err) {
			// Roll back both side effects so a failed request can't leave an orphaned
			// object or a manual row with no queued job. Best-effort: a manual may not
			// exist yet (if saveManual was what failed) and cleanup errors are ignored.
			await Promise.allSettled([
				deleteManual(locals.db, id),
				locals.db.storage.from(VIDEO_BUCKET).remove([path])
			]);
			const message = err instanceof Error ? err.message : 'unknown error';
			return fail(500, { error: `Could not start processing: ${message}` });
		}

		redirect(303, `/manuals/${id}`);
	}
};
