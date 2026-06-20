import type { ManualStep } from '@vitruvius/core';
import { getInstructProvider } from '../providers/instruct-provider.js';
import {
	getCachedInstructions,
	instructCacheKey,
	INSTRUCT_PROMPT_VERSION,
	setCachedInstructions
} from './cache.js';
import { mergeInstruction } from './merge.js';
import type { InstructInput, RawInstruction } from './types.js';

async function instructWithCache(
	steps: ManualStep[],
	learnings: string[],
	manualId?: string
): Promise<RawInstruction[]> {
	const key = instructCacheKey({ promptVersion: INSTRUCT_PROMPT_VERSION, steps, learnings });

	const cached = getCachedInstructions(key);
	if (cached) return cached;

	const provider = getInstructProvider();
	const raw = await provider.writeInstructions(steps, { learnings, manualId });

	setCachedInstructions(key, raw);
	return raw;
}

/**
 * Instruction Writer agent (spec 06): enrich segmented steps with operative fields
 * in one structured provider call, preserving segmentation facts. Steps the provider
 * does not return are passed through unchanged.
 */
export async function enrichSteps(input: InstructInput): Promise<ManualStep[]> {
	if (input.steps.length === 0) return [];

	const learnings = input.learnings ?? [];
	const raw = await instructWithCache(input.steps, learnings, input.manualId);

	const byOrder = new Map<number, RawInstruction>();
	for (const r of raw) byOrder.set(r.order, r);

	return input.steps.map((step) => {
		const match = byOrder.get(step.order);
		return match ? mergeInstruction(step, match) : step;
	});
}
