import type { ManualStep } from '@vitruvius/core';
import { enrichSteps } from './instruct/instruct.js';
import type { InstructInput } from './instruct/types.js';
import { rawSegmentToManualStep } from './segment/map-step.js';
import { segmentIntoRawSteps } from './segment/segment.js';
import type { SegmentInput } from './segment/types.js';

export {
	createInstructProvider,
	GeminiInstructProvider,
	getInstructProvider,
	HeuristicInstructProvider,
	resetInstructProviderFactory,
	setInstructProviderFactory
} from './providers/instruct-provider.js';
export {
	GeminiSegmentProvider,
	getSegmentProvider,
	HeuristicSegmentProvider,
	resetSegmentProviderFactory,
	setSegmentProviderFactory
} from './providers/segment-provider.js';
export { clearInstructCache } from './instruct/cache.js';
export type { InstructInput, InstructOptions } from './instruct/types.js';
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

/**
 * Instruction Writer agent (spec 06): enrich segmented `ManualStep[]` with operative
 * fields (`title`, `instruction`, `tools`, `parts`, `warnings`, `alternatives`) in one
 * structured call, preserving each step's `sourceNotes`, `confidence`, and time bounds.
 */
export async function writeInstructions(input: InstructInput): Promise<ManualStep[]> {
	return enrichSteps(input);
}
