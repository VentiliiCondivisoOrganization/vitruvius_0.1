import { m } from '$lib/paraglide/messages';
import {
	MAX_BOM_BYTES,
	MAX_MANUALS_PER_WINDOW,
	MAX_MANUALS_TOTAL,
	MAX_MODEL_BYTES,
	MAX_VIDEO_BYTES,
	RATE_WINDOW_MS,
	formatBytes
} from '@vitruvius/core';
import { countManuals, type DbClient } from '@vitruvius/db';
import type { AuxFiles } from './uploads';

// Server-side abuse guardrails for the upload entry points. All checks return an error
// message ready for `fail(...)` or `null` when the request is within limits, so callers
// stay a one-liner. The numbers live in `@vitruvius/core` (`limits.ts`).

/** Reject an oversized source video before its bytes are buffered into memory. */
export function checkVideoSize(file: File): { error: string } | null {
	if (file.size > MAX_VIDEO_BYTES) {
		return { error: m.error_video_too_large({ limit: formatBytes(MAX_VIDEO_BYTES) }) };
	}
	return null;
}

/** Reject oversized optional BOM/model files. Shared by the upload and enrich actions. */
export function checkAuxSizes(aux: AuxFiles): { error: string } | null {
	if (aux.bomFile && aux.bomFile.size > MAX_BOM_BYTES) {
		return { error: m.error_bom_too_large({ limit: formatBytes(MAX_BOM_BYTES) }) };
	}
	if (aux.modelFile && aux.modelFile.size > MAX_MODEL_BYTES) {
		return { error: m.error_model_too_large({ limit: formatBytes(MAX_MODEL_BYTES) }) };
	}
	return null;
}

/**
 * Per-user flood guard: cap how many manuals a user may create in the rolling window and
 * in total. The db client is RLS-scoped to the signed-in user, so both counts are
 * inherently per-user. Returns a (429-style) error message or null.
 */
export async function checkUploadQuota(db: DbClient): Promise<{ error: string } | null> {
	const total = await countManuals(db);
	if (total >= MAX_MANUALS_TOTAL) {
		return { error: m.error_quota_reached({ limit: MAX_MANUALS_TOTAL }) };
	}

	const sinceIso = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
	const recent = await countManuals(db, sinceIso);
	if (recent >= MAX_MANUALS_PER_WINDOW) {
		return { error: m.error_too_many_manuals({ limit: MAX_MANUALS_PER_WINDOW }) };
	}

	return null;
}
