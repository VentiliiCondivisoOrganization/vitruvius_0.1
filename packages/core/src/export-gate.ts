import { partRefHasOpenCandidates } from './part-ref.js';
import type { InstructionManual } from './types.js';

export type ExportGateResult = { ok: true } | { ok: false; reason: string };

/**
 * Pre-export gate (spec 09): all steps confirmed and no open BOM disambiguation.
 */
export function checkExportGate(manual: InstructionManual): ExportGateResult {
	const unconfirmed = manual.steps.filter((step) => step.reviewStatus !== 'confirmed');
	if (unconfirmed.length > 0) {
		return {
			ok: false,
			reason: `${unconfirmed.length} step(s) must be confirmed before export.`
		};
	}

	for (const step of manual.steps) {
		for (const part of step.parts) {
			if (partRefHasOpenCandidates(part)) {
				return {
					ok: false,
					reason: `Step ${step.order + 1} has unresolved BOM part choices.`
				};
			}
		}
	}

	return { ok: true };
}
