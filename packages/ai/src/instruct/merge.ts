import { manualStepSchema, partRefsFromLabels, type ManualStep } from '@vitruvius/core';
import type { RawInstruction } from './types.js';

/** Trim entries and drop blanks — provider lists may contain whitespace-only strings. */
function cleanList(values: string[]): string[] {
	return values.map((v) => v.trim()).filter((v) => v.length > 0);
}

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
		// Keep the original instruction if the provider returns a blank one.
		instruction: raw.instruction.trim() || original.instruction,
		tools: cleanList(raw.tools),
		parts: original.parts.length > 0 ? original.parts : partRefsFromLabels(cleanList(raw.parts)),
		warnings: cleanList(raw.warnings),
		alternatives: cleanList(raw.alternatives),
		sourceNotes: mergeSourceNotes(original.sourceNotes, raw.addedSourceNotes)
	};

	return manualStepSchema.parse(step);
}
