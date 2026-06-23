import { manualStepSchema, type ManualStep } from '@vitruvius/core';

/**
 * Set a step's print-ready `illustrationUrl` while preserving everything else — crucially
 * `keyframeUrl`, which stays available as source evidence after illustration (spec 14).
 * Output is schema-validated like every other agent's merge.
 */
export function mergeIllustration(original: ManualStep, illustrationUrl: string): ManualStep {
	const step: ManualStep = { ...original, illustrationUrl };
	return manualStepSchema.parse(step);
}
