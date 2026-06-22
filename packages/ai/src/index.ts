import type { ManualStep, NewLearning } from '@vitruvius/core';
import { critiqueSteps as runCritiqueSteps } from './critique/critique.js';
import type { CritiqueInput } from './critique/types.js';
import { illustrateSteps as runIllustrateSteps } from './illustrate/illustrate.js';
import type { IllustrateInput } from './illustrate/types.js';
import { enrichSteps } from './instruct/instruct.js';
import type { InstructInput } from './instruct/types.js';
import { distillLearnings as runDistillLearnings } from './learnings/distill.js';
import type { DistillInput } from './learnings/types.js';
import { rawSegmentToManualStep } from './segment/map-step.js';
import { segmentIntoRawSteps } from './segment/segment.js';
import type { SegmentInput } from './segment/types.js';

export { clearCritiqueCache } from './critique/cache.js';
export type { CritiqueInput, CritiqueOptions } from './critique/types.js';
export { clearIllustrateCache } from './illustrate/cache.js';
export type { IllustrateInput, IllustrateOptions, IllustrationMode } from './illustrate/types.js';
export { clearInstructCache } from './instruct/cache.js';
export type { InstructInput, InstructOptions } from './instruct/types.js';
export { isReusableLearning } from './learnings/distill.js';
export type { DistillInput } from './learnings/types.js';
export {
	createCritiqueProvider,
	GeminiCritiqueProvider,
	getCritiqueProvider,
	HeuristicCritiqueProvider,
	resetCritiqueProviderFactory,
	setCritiqueProviderFactory
} from './providers/critique-provider.js';
export {
	createIllustrateProvider,
	GeminiIllustrateProvider,
	getIllustrateProvider,
	HeuristicIllustrateProvider,
	resetIllustrateProviderFactory,
	setIllustrateProviderFactory
} from './providers/illustrate-provider.js';
export {
	createInstructProvider,
	GeminiInstructProvider,
	getInstructProvider,
	HeuristicInstructProvider,
	resetInstructProviderFactory,
	setInstructProviderFactory
} from './providers/instruct-provider.js';
export {
	createLearningsProvider,
	GeminiLearningsProvider,
	getLearningsProvider,
	HeuristicLearningsProvider,
	resetLearningsProviderFactory,
	setLearningsProviderFactory
} from './providers/learnings-provider.js';
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

/**
 * Instruction Writer agent (spec 06): enrich segmented `ManualStep[]` with operative
 * fields (`title`, `instruction`, `tools`, `parts`, `warnings`, `alternatives`) in one
 * structured call, preserving each step's `sourceNotes`, `confidence`, and time bounds.
 */
export async function writeInstructions(input: InstructInput): Promise<ManualStep[]> {
	return enrichSteps(input);
}

/**
 * Illustrator agent (spec 14 tier 1): give each critic-reviewed step a print-ready
 * `illustrationUrl` — an AI schematic redrawn from the video keyframe, or (with a primed
 * CAD model) the schematic laid out on a canonical view (Compositor-lite). Generation is
 * cached per step and the output is a file ref, never inline image bytes.
 */
export async function illustrateSteps(input: IllustrateInput): Promise<ManualStep[]> {
	return runIllustrateSteps(input);
}

/**
 * Critic agent (spec 10): an independent, text-only review of the enriched `ManualStep[]`.
 * Recalibrates `confidence` (lowering it where evidence is weak) and fills `critique` with
 * concrete flags, never rewriting the instruction text.
 */
export async function critiqueSteps(input: CritiqueInput): Promise<ManualStep[]> {
	return runCritiqueSteps(input);
}

/**
 * Learnings distiller (spec 11): extract durable, generalizable heuristics from a
 * finished run, rejecting per-video noise and anything already known. Returns
 * `NewLearning[]` ready to persist via `@vitruvius/db`'s `saveLearnings`.
 */
export async function distillLearnings(input: DistillInput): Promise<NewLearning[]> {
	return runDistillLearnings(input);
}

export {
	createBomDisambiguateProvider,
	disambiguateBomSteps,
	getBomDisambiguateProvider,
	HeuristicBomDisambiguateProvider,
	resetBomDisambiguateProviderFactory,
	setBomDisambiguateProviderFactory
} from './bom-map/disambiguate.js';
export type { BomDisambiguateInput, BomDisambiguateOptions } from './bom-map/types.js';
