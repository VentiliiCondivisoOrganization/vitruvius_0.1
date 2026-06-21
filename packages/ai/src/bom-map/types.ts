import type { ManualBomItem, ManualStep } from '@vitruvius/core';

export type BomDisambiguateInput = {
	steps: ManualStep[];
	manualBom: ManualBomItem[];
	ambiguousStepOrders: number[];
};

export type BomDisambiguateOptions = {
	manualId?: string;
};
