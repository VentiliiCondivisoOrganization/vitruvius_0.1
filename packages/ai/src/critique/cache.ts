import type { ManualStep } from '@vitruvius/core';
import { createHash } from 'node:crypto';
import type { RawCritique } from './types.js';

export const CRITIQUE_PROMPT_VERSION = 'critique-v1';

/** The slice of a step that determines the Critic's verdict. */
function stepFingerprint(step: ManualStep): unknown {
	return {
		order: step.order,
		instruction: step.instruction,
		tools: step.tools,
		parts: step.parts,
		warnings: step.warnings,
		confidence: step.confidence,
		sourceNotes: step.sourceNotes
	};
}

export function critiqueCacheKey(input: {
	promptVersion: string;
	steps: ManualStep[];
	learnings: string[];
}): string {
	const payload = JSON.stringify({
		promptVersion: input.promptVersion,
		steps: input.steps.map(stepFingerprint),
		learnings: input.learnings
	});
	return createHash('sha256').update(payload).digest('hex');
}

/** In-process memoization — identical inputs are not re-billed in the same engine run. */
const cache = new Map<string, RawCritique[]>();

export function getCachedCritiques(key: string): RawCritique[] | undefined {
	return cache.get(key);
}

export function setCachedCritiques(key: string, verdicts: RawCritique[]): void {
	cache.set(key, verdicts);
}

/** Test-only: reset between test files. */
export function clearCritiqueCache(): void {
	cache.clear();
}
