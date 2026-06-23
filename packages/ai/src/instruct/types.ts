import type { ManualStep } from '@vitruvius/core';

/** Optional priming from the learnings store (spec 11) — empty when not yet implemented. */
export type InstructOptions = {
	learnings?: string[];
	manualId?: string;
	/** Natural-language steering from a `regenerate` text job (spec 16). Empty on a normal run. */
	guidance?: string;
};

/**
 * Input to the Instruction Writer (spec 06): the segmented steps from spec 05
 * (with `startMs`/`endMs`, `confidence`, `sourceNotes` populated) to be enriched
 * with operative fields in place.
 */
export type InstructInput = InstructOptions & {
	steps: ManualStep[];
};

/**
 * One step's operative fields as returned by a model provider, before being merged
 * back onto the original `ManualStep`. `order` ties the enrichment to its source step.
 * `addedSourceNotes` cite visual evidence (keyframes) not already in the step's notes,
 * keeping every populated field traceable to a source note (spec 06 acceptance).
 */
export type RawInstruction = {
	order: number;
	title: string;
	instruction: string;
	tools: string[];
	parts: string[];
	warnings: string[];
	alternatives: string[];
	addedSourceNotes?: string[];
};
