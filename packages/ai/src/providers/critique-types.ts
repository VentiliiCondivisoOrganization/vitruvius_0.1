import type { ManualStep } from '@vitruvius/core';
import type { RawCritique } from '../critique/types.js';

export type CritiqueProviderContext = {
	learnings: string[];
	manualId?: string;
};

export interface CritiqueProvider {
	readonly name: string;
	critiqueSteps(steps: ManualStep[], context: CritiqueProviderContext): Promise<RawCritique[]>;
}

export type CritiqueProviderFactory = () => CritiqueProvider;
