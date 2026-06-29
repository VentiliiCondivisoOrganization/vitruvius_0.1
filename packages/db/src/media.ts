import type { InstructionManual, ManualStep } from '@vitruvius/core';
import type { DbClient } from './client.js';
import { presignManualMediaBatch } from './storage.js';

/**
 * A step's `keyframeUrl`/`illustrationUrl` is stored as a `media` bucket object key (see
 * publishStepMedia). A media key is a relative path with no URL scheme — distinct from an
 * already-signed `http(s)` URL or a legacy absolute `/tmp` path left by a pre-migration run,
 * both of which must be passed through untouched.
 */
function isMediaKey(ref: string): boolean {
	return (
		ref !== '' && !ref.startsWith('/') && !ref.startsWith('file:') && !/^https?:\/\//i.test(ref)
	);
}

/**
 * Sign every per-step media object key on a manual in one batched round-trip. Returns a Map
 * from object key → short-lived signed URL (keys that fail to sign are omitted). This is the
 * read-time analogue of `presignVideoGet`; it preserves the stored keys so callers that
 * round-trip the manual back to the DB (the editor save) never persist an expiring URL.
 */
export async function signManualMediaUrls(
	db: DbClient,
	manual: InstructionManual,
	ttlSeconds?: number
): Promise<Map<string, string>> {
	const keys = new Set<string>();
	for (const step of manual.steps) {
		if (isMediaKey(step.keyframeUrl)) keys.add(step.keyframeUrl);
		if (isMediaKey(step.illustrationUrl)) keys.add(step.illustrationUrl);
	}
	if (keys.size === 0) return new Map();
	return presignManualMediaBatch(db, [...keys], ttlSeconds);
}

/**
 * Resolve a manual's per-step media keys to signed URLs in place, returning a copy with each
 * step's `keyframeUrl`/`illustrationUrl` rewritten from object key → signed URL. Use this for
 * read-only renders (PDF export, the standalone HTML view) — NOT for the editor, which would
 * round-trip the (expiring) URLs back into storage on save; that path uses
 * `signManualMediaUrls` to resolve for display while keeping the stored keys intact.
 */
export async function signManualMedia(
	db: DbClient,
	manual: InstructionManual,
	ttlSeconds?: number
): Promise<InstructionManual> {
	const signed = await signManualMediaUrls(db, manual, ttlSeconds);
	if (signed.size === 0) return manual;

	const resolve = (ref: string): string => (isMediaKey(ref) ? (signed.get(ref) ?? ref) : ref);
	const steps: ManualStep[] = manual.steps.map((step) => ({
		...step,
		keyframeUrl: resolve(step.keyframeUrl),
		illustrationUrl: resolve(step.illustrationUrl)
	}));
	return { ...manual, steps };
}
