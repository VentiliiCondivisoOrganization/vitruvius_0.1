import { m } from '$lib/paraglide/messages';
import type { DbClient } from '@vitruvius/db';

// The bucket holding every per-manual upload (video + optional BOM/model).
export const VIDEO_BUCKET = 'videos';

/**
 * Deterministic storage object key: `<prefix-id>/<role>.<ext>`. The extension is
 * sanitised so a hostile filename can't escape the manual's folder.
 */
export function storageKey(id: string, filename: string, role: string): string {
	const ext =
		filename
			.split('.')
			.pop()
			?.toLowerCase()
			.replace(/[^a-z0-9]/g, '') ?? '';
	return ext ? `${id}/${role}.${ext}` : `${id}/${role}`;
}

/** A non-empty uploaded file for `field`, or null when the field is absent/empty. */
export function optionalFile(form: FormData, field: string): File | null {
	const file = form.get(field);
	if (!(file instanceof File) || file.size === 0) return null;
	return file;
}

export type AuxFiles = { bomFile: File | null; modelFile: File | null };

/**
 * Read and validate the optional BOM + digital-model files from a form (spec 03/13/12
 * formats). Shared by the initial upload and the spec 17 enrich trigger so both enforce
 * the same rules. Returns an error message (for `fail(400, …)`) or the validated files.
 */
export function readAuxFiles(form: FormData): { error: string } | AuxFiles {
	const bomFile = optionalFile(form, 'bom');
	if (bomFile && !bomFile.name.toLowerCase().endsWith('.csv')) {
		return { error: m.error_bom_must_be_csv() };
	}

	const modelFile = optionalFile(form, 'model');
	if (modelFile) {
		const lower = modelFile.name.toLowerCase();
		const ok = ['.step', '.stp', '.obj', '.stl'].some((ext) => lower.endsWith(ext));
		if (!ok) return { error: m.error_model_must_be_step_obj_stl() };
	}

	return { bomFile, modelFile };
}

/**
 * Upload the optional BOM/model under a storage `prefix`. Returns the stored refs and the
 * object paths written (so the caller can roll back its own earlier uploads too). On a
 * storage error it removes whatever it wrote and returns an error message.
 */
export async function uploadAuxFiles(
	db: DbClient,
	prefix: string,
	files: AuxFiles
): Promise<
	{ error: string } | { bomFileUrl: string; digitalModelUrl: string; uploadedPaths: string[] }
> {
	const uploadedPaths: string[] = [];

	let bomFileUrl = '';
	if (files.bomFile) {
		bomFileUrl = storageKey(prefix, files.bomFile.name, 'bom');
		uploadedPaths.push(bomFileUrl);
		const { error } = await db.storage
			.from(VIDEO_BUCKET)
			.upload(bomFileUrl, files.bomFile, { contentType: 'text/csv' });
		if (error) {
			await db.storage.from(VIDEO_BUCKET).remove(uploadedPaths);
			return { error: m.error_bom_upload_failed({ message: error.message }) };
		}
	}

	let digitalModelUrl = '';
	if (files.modelFile) {
		digitalModelUrl = storageKey(prefix, files.modelFile.name, 'model');
		uploadedPaths.push(digitalModelUrl);
		const { error } = await db.storage.from(VIDEO_BUCKET).upload(digitalModelUrl, files.modelFile, {
			contentType: files.modelFile.type || 'application/octet-stream'
		});
		if (error) {
			await db.storage.from(VIDEO_BUCKET).remove(uploadedPaths);
			return { error: m.error_model_upload_failed({ message: error.message }) };
		}
	}

	return { bomFileUrl, digitalModelUrl, uploadedPaths };
}
