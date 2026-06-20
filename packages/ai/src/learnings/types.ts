import type { ManualStep } from '@vitruvius/core';

/**
 * Input to the learnings distiller (spec 11): a finished run's steps plus the
 * manual they came from. `existingLearnings` (text already in the store) lets the
 * distiller avoid re-proposing duplicates.
 */
export type DistillInput = {
	manualId: string;
	steps: ManualStep[];
	existingLearnings?: string[];
};

/** One candidate heuristic from a provider, before noise-filtering and persistence. */
export type RawLearning = {
	scope: string;
	text: string;
};
