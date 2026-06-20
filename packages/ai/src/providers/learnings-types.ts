import type { ManualStep } from '@vitruvius/core';
import type { RawLearning } from '../learnings/types.js';

export type LearningsProviderContext = {
	existingLearnings: string[];
};

export interface LearningsProvider {
	readonly name: string;
	distill(steps: ManualStep[], context: LearningsProviderContext): Promise<RawLearning[]>;
}

export type LearningsProviderFactory = () => LearningsProvider;
