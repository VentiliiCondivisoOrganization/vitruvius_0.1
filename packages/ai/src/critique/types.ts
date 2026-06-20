import type { ManualStep } from '@vitruvius/core';

/** Optional priming — the Critic may use prior learnings (spec 11) to judge conventions. */
export type CritiqueOptions = {
	learnings?: string[];
	manualId?: string;
};

/**
 * Input to the Critic (spec 10): the enriched steps from spec 06. The Critic scores and
 * flags them; it never rewrites `instruction` text.
 */
export type CritiqueInput = CritiqueOptions & {
	steps: ManualStep[];
};

/**
 * One step's verdict from a Critic provider, before being merged onto the original step.
 * `order` ties the verdict to its source step; `confidence` is the recalibrated value;
 * `critique` lists concrete, actionable flags (empty when well-supported).
 */
export type RawCritique = {
	order: number;
	confidence: number;
	critique: string[];
};
