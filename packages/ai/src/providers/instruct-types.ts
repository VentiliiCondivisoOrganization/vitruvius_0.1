import type { ManualStep } from '@vitruvius/core';
import type { RawInstruction } from '../instruct/types.js';

export type InstructProviderContext = {
	learnings: string[];
	manualId?: string;
};

export interface InstructProvider {
	readonly name: string;
	writeInstructions(
		steps: ManualStep[],
		context: InstructProviderContext
	): Promise<RawInstruction[]>;
}

export type InstructProviderFactory = () => InstructProvider;
