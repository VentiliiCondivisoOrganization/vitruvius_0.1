import type { ManualStep } from '@vitruvius/core';
import {
	manualMediaKey,
	uploadManualMedia,
	type DbClient,
	type ManualMediaKind
} from '@vitruvius/db';
import { readFile } from 'node:fs/promises';
import { basename, extname, isAbsolute } from 'node:path';

/** Map a file extension to the image content type stored alongside the object. */
function contentTypeFor(fileName: string): string {
	switch (extname(fileName).toLowerCase()) {
		case '.jpg':
		case '.jpeg':
			return 'image/jpeg';
		case '.png':
			return 'image/png';
		case '.webp':
			return 'image/webp';
		default:
			return 'application/octet-stream';
	}
}

/**
 * Upload a single local media ref and return its `media` bucket object key. A ref that is not
 * an absolute local path (an already-published key, an `http` URL, or an empty string) is
 * returned unchanged — so the pipeline can run publish on steps that mix fresh and prior media,
 * and so re-runs (enrich/regenerate) are idempotent.
 */
async function publishRef(
	db: DbClient,
	manualId: string,
	kind: ManualMediaKind,
	ref: string
): Promise<string> {
	if (ref === '' || !isAbsolute(ref)) return ref;
	const body = await readFile(ref);
	const fileName = basename(ref);
	const key = manualMediaKey(manualId, kind, fileName);
	await uploadManualMedia(db, key, body, contentTypeFor(fileName));
	return key;
}

/**
 * Upload every step's locally-written keyframe and illustration to the `media` bucket and
 * rewrite the step refs to the resulting object keys. This is the single seam that turns
 * in-run local files (under the job's `workDir`) into durable storage keys before the manual is
 * saved — letting the engine delete all local scratch and letting the web/export resolve the
 * keys to signed URLs at read time (see signManualMedia). Order is preserved.
 */
export async function publishStepMedia(
	db: DbClient,
	manualId: string,
	steps: ManualStep[]
): Promise<ManualStep[]> {
	return Promise.all(
		steps.map(async (step) => ({
			...step,
			keyframeUrl: await publishRef(db, manualId, 'keyframes', step.keyframeUrl),
			illustrationUrl: await publishRef(db, manualId, 'illustrations', step.illustrationUrl)
		}))
	);
}
