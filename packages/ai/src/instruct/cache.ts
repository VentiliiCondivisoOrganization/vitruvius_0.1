import type { ManualStep } from '@vitruvius/core';
import { createHash } from 'node:crypto';
import type { RawInstruction } from './types.js';

export const INSTRUCT_PROMPT_VERSION = 'instruct-v1';

/** The slice of a step that determines the instruction-writing call's output. */
function stepFingerprint(step: ManualStep): unknown {
	return {
		order: step.order,
		title: step.title,
		startMs: step.startMs,
		endMs: step.endMs,
		keyframeUrl: step.keyframeUrl,
		sourceNotes: step.sourceNotes
	};
}

export function instructCacheKey(input: {
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
const cache = new Map<string, RawInstruction[]>();

export function getCachedInstructions(key: string): RawInstruction[] | undefined {
	return cache.get(key);
}

export function setCachedInstructions(key: string, steps: RawInstruction[]): void {
	cache.set(key, steps);
}

/** Test-only: reset between test files. */
export function clearInstructCache(): void {
	cache.clear();
}
