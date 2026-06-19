import type { ManualStep } from '@vitruvius/core';
import { rawSegmentToManualStep } from './segment/map-step.js';
import { segmentIntoRawSteps } from './segment/segment.js';
import type { SegmentInput } from './segment/types.js';

export {
	GeminiSegmentProvider,
	getSegmentProvider,
	HeuristicSegmentProvider,
	resetSegmentProviderFactory,
	setSegmentProviderFactory
} from './providers/segment-provider.js';
export { clearSegmentCache } from './segment/cache.js';
export type { SegmentInput, SegmentMediaContext, SegmentOptions } from './segment/types.js';

/** Map a local keyframe path to a public URL — default identity until Storage upload exists. */
export type KeyframeUrlMapper = (fileRef: string) => string;

const defaultKeyframeUrlMapper: KeyframeUrlMapper = (fileRef) => fileRef;

/**
 * Segmenter agent (spec 05): video + media artifacts → schema-valid `ManualStep[]`
 * with time bounds, confidence, and sourceNotes. Instruction fields are left empty
 * for the Instructor (spec 06).
 */
export async function segmentVideoIntoSteps(
	input: SegmentInput,
	mapKeyframeUrl: KeyframeUrlMapper = defaultKeyframeUrlMapper
): Promise<ManualStep[]> {
	const rawSteps = await segmentIntoRawSteps(input);
	return rawSteps.map((seg) => rawSegmentToManualStep(seg, input.keyframes, mapKeyframeUrl));
}

// Spec 06 — not implemented in this PR.
export async function writeInstructions(_steps: ManualStep[]): Promise<ManualStep[]> {
	throw new Error('not implemented');
}
