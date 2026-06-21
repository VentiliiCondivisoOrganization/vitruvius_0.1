import {
	partRefFromLabel,
	type ManualBomItem,
	type ManualStep,
	type PartRef
} from '@vitruvius/core';

const GENERIC_TERMS = [
	'vite',
	'bullone',
	'dado',
	'rondella',
	'staffa',
	'perno',
	'rail',
	'carriage',
	'bolt',
	'screw',
	'bracket',
	'shelf',
	'leg',
	'seal',
	'washer',
	'nut',
	'pin',
	'componente',
	'parte'
];

function normalize(value: string): string {
	return value
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

function stepEvidence(step: ManualStep): string {
	return [step.title, ...step.sourceNotes].join(' ').toLowerCase();
}

function extractGenericLabels(evidence: string): string[] {
	const labels: string[] = [];

	for (const match of evidence.matchAll(/"([^"]{2,80})"/g)) {
		const label = match[1]?.trim();
		if (label) labels.push(label);
	}

	for (const term of GENERIC_TERMS) {
		if (evidence.includes(term)) labels.push(term);
	}

	return [...new Set(labels.map((label) => label.trim()).filter(Boolean))];
}

function findMentionedItems(evidence: string, manualBom: ManualBomItem[]): ManualBomItem[] {
	const normEvidence = normalize(evidence);
	const matched: ManualBomItem[] = [];

	for (const item of manualBom) {
		const normName = normalize(item.partName);
		if (normName.length >= 3 && normEvidence.includes(normName)) {
			matched.push(item);
			continue;
		}
		if (item.bomCode) {
			const normCode = normalize(item.bomCode);
			if (normCode.length >= 2 && normEvidence.includes(normCode)) {
				matched.push(item);
			}
		}
	}

	const seen = new Set<string>();
	return matched.filter((item) => {
		if (seen.has(item.id)) return false;
		seen.add(item.id);
		return true;
	});
}

function partRefFromItem(item: ManualBomItem, confidence: number): PartRef {
	return {
		bomItemId: item.id,
		label: item.partName,
		bomCode: item.bomCode,
		description: item.description,
		confidence
	};
}

function mapStepParts(
	step: ManualStep,
	manualBom: ManualBomItem[]
): { parts: PartRef[]; ambiguous: boolean } {
	const evidence = stepEvidence(step);

	if (manualBom.length === 0) {
		const labels = extractGenericLabels(evidence);
		const title = step.title.trim();
		if (labels.length === 0 && title && !/^step\s+\d+/i.test(title)) {
			labels.push(title);
		}
		if (labels.length === 0) {
			labels.push('componente');
		}
		return {
			parts: labels.map((label) => partRefFromLabel(label, 0.7)),
			ambiguous: false
		};
	}

	const matched = findMentionedItems(evidence, manualBom);
	if (matched.length === 1) {
		return { parts: [partRefFromItem(matched[0]!, 0.88)], ambiguous: false };
	}
	if (matched.length > 1) {
		return {
			parts: [
				{
					bomItemId: null,
					label: matched.map((item) => item.partName).join(' / '),
					confidence: 0.5,
					candidateBomItemIds: matched.map((item) => item.id)
				}
			],
			ambiguous: true
		};
	}

	const labels = extractGenericLabels(evidence);
	if (labels.length === 0) labels.push('componente');
	return {
		parts: labels.map((label) => partRefFromLabel(label, 0.65)),
		ambiguous: false
	};
}

export type BomMapInput = {
	steps: ManualStep[];
	manualBom: ManualBomItem[];
};

export type BomMapResult = {
	steps: ManualStep[];
	manualBom: ManualBomItem[];
	ambiguousStepOrders: number[];
};

/** Deterministic BOM layer (spec 13): map step evidence → `PartRef[]`. */
export function mapBomToSteps(input: BomMapInput): BomMapResult {
	const ambiguousStepOrders: number[] = [];
	const steps = input.steps.map((step) => {
		const { parts, ambiguous } = mapStepParts(step, input.manualBom);
		if (ambiguous) ambiguousStepOrders.push(step.order);
		return { ...step, parts };
	});

	return {
		steps,
		manualBom: input.manualBom,
		ambiguousStepOrders
	};
}
