import { manualStepSchema, type ManualStep } from '@vitruvius/core';
import type { RawCritique } from './types.js';

function clamp01(value: number): number {
	if (Number.isNaN(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

/** Trim entries and drop blanks — provider critique lists may contain whitespace-only strings. */
function cleanList(values: string[]): string[] {
	return values.map((v) => v.trim()).filter((v) => v.length > 0);
}

/**
 * Apply a Critic verdict onto a step: recalibrate `confidence` (never above the input)
 * and set `critique`. Everything the generators produced — `instruction`, `title`,
 * `tools`, `parts`, `warnings`, `sourceNotes` — is preserved untouched (spec 10: the
 * Critic only scores and flags). Output is schema-validated.
 */
export function mergeCritique(original: ManualStep, raw: RawCritique): ManualStep {
	const step: ManualStep = {
		...original,
		// The Critic may lower confidence but must not inflate the generator's own estimate.
		confidence: Math.min(original.confidence, clamp01(raw.confidence)),
		critique: cleanList(raw.critique)
	};

	return manualStepSchema.parse(step);
}
