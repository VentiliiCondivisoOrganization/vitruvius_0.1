import type { ManualStep } from '@vitruvius/core';
import { getCritiqueProvider } from '../providers/critique-provider.js';
import {
	CRITIQUE_PROMPT_VERSION,
	critiqueCacheKey,
	getCachedCritiques,
	setCachedCritiques
} from './cache.js';
import { mergeCritique } from './merge.js';
import type { CritiqueInput, RawCritique } from './types.js';

async function critiqueWithCache(
	steps: ManualStep[],
	learnings: string[],
	manualId?: string
): Promise<RawCritique[]> {
	const key = critiqueCacheKey({ promptVersion: CRITIQUE_PROMPT_VERSION, steps, learnings });

	const cached = getCachedCritiques(key);
	if (cached) return cached;

	const provider = getCritiqueProvider();
	const verdicts = await provider.critiqueSteps(steps, { learnings, manualId });

	setCachedCritiques(key, verdicts);
	return verdicts;
}

/**
 * Critic agent (spec 10): an independent, text-only pass that recalibrates `confidence`
 * and flags unsupported claims in `critique`, preserving the generated instruction text.
 * Steps the provider does not return are passed through unchanged.
 */
export async function critiqueSteps(input: CritiqueInput): Promise<ManualStep[]> {
	if (input.steps.length === 0) return [];

	const learnings = input.learnings ?? [];
	const verdicts = await critiqueWithCache(input.steps, learnings, input.manualId);

	const byOrder = new Map<number, RawCritique>();
	for (const v of verdicts) byOrder.set(v.order, v);

	return input.steps.map((step) => {
		const match = byOrder.get(step.order);
		return match ? mergeCritique(step, match) : step;
	});
}
