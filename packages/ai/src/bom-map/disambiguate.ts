import type { ManualStep } from '@vitruvius/core';
import { getBomDisambiguateProvider } from '../providers/bom-disambiguate-provider.js';
import type { BomDisambiguateInput, BomDisambiguateOptions } from './types.js';

/**
 * Refine ambiguous BOM mappings (spec 13). Deterministic mapping runs first in `@vitruvius/cad`;
 * this pass only touches steps flagged ambiguous. Providers never auto-resolve `bomItemId`.
 */
export async function disambiguateBomSteps(
	input: BomDisambiguateInput,
	options: BomDisambiguateOptions = {}
): Promise<ManualStep[]> {
	if (input.ambiguousStepOrders.length === 0) return input.steps;

	const provider = getBomDisambiguateProvider();
	return provider.disambiguate(input, { manualId: options.manualId });
}

export {
	HeuristicBomDisambiguateProvider,
	createBomDisambiguateProvider,
	getBomDisambiguateProvider,
	resetBomDisambiguateProviderFactory,
	setBomDisambiguateProviderFactory
} from '../providers/bom-disambiguate-provider.js';
