import { manualStepSchema, type ManualStep } from '@vitruvius/core';
import type { RawInstruction } from './types.js';

/** Append-only union that preserves order and drops duplicates/blank notes. */
function mergeSourceNotes(original: string[], added: string[] | undefined): string[] {
	const seen = new Set(original);
	const merged = [...original];
	for (const note of added ?? []) {
		const trimmed = note.trim();
		if (trimmed && !seen.has(trimmed)) {
			seen.add(trimmed);
			merged.push(trimmed);
		}
	}
	return merged;
}

/**
 * Merge a model's operative fields onto the original segmented step. Segmentation
 * facts (`id`, `order`, `startMs`/`endMs`, `confidence`, `keyframeUrl`, `reviewStatus`)
 * are preserved untouched; `sourceNotes` are extended with any visual-evidence notes so
 * every enriched field stays traceable (spec 06 acceptance). Output is schema-validated.
 */
export function mergeInstruction(original: ManualStep, raw: RawInstruction): ManualStep {
	const step: ManualStep = {
		...original,
		title: raw.title.trim() || original.title,
		instruction: raw.instruction.trim(),
		tools: raw.tools,
		parts: raw.parts,
		warnings: raw.warnings,
		alternatives: raw.alternatives,
		sourceNotes: mergeSourceNotes(original.sourceNotes, raw.addedSourceNotes)
	};

	return manualStepSchema.parse(step);
}
