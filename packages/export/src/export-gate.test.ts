import {
	checkExportGate,
	formatManualBomItem,
	manualStepSchema,
	partRefFromLabel,
	resolvePartRefBomCandidate,
	type InstructionManual,
	type ManualBomItem
} from '@vitruvius/core';
import { describe, expect, it } from 'vitest';

function manual(steps: InstructionManual['steps']): InstructionManual {
	return {
		id: '11111111-1111-1111-1111-111111111111',
		title: 'Test',
		videoUrl: 'videos/x/source.mp4',
		bomFileUrl: '',
		digitalModelUrl: '',
		status: 'ready',
		steps,
		bom: [],
		createdAt: '2026-06-21T00:00:00.000Z',
		updatedAt: '2026-06-21T00:00:00.000Z'
	};
}

const baseStep = manualStepSchema.parse({
	id: '22222222-2222-2222-2222-222222222222',
	order: 0,
	title: 'Step 1',
	instruction: 'Do it',
	caption: '',
	startMs: 0,
	endMs: 1000,
	keyframeUrl: '',
	illustrationUrl: '',
	tools: [],
	parts: [partRefFromLabel('rail')],
	warnings: [],
	confidence: 1,
	reviewStatus: 'confirmed',
	sourceNotes: [],
	alternatives: [],
	critique: []
});

describe('checkExportGate', () => {
	it('passes when all steps are confirmed and BOM is resolved', () => {
		expect(checkExportGate(manual([baseStep])).ok).toBe(true);
	});

	it('blocks when a step is not confirmed', () => {
		const gate = checkExportGate(manual([{ ...baseStep, reviewStatus: 'hypothesis' }]));
		expect(gate.ok).toBe(false);
	});

	it('blocks when BOM candidates are open', () => {
		const gate = checkExportGate(
			manual([
				{
					...baseStep,
					parts: [{ ...partRefFromLabel('part'), candidateBomItemIds: ['a', 'b'] }]
				}
			])
		);
		expect(gate.ok).toBe(false);
	});
});

describe('resolvePartRefBomCandidate', () => {
	const bomItem: ManualBomItem = {
		id: 'bom-1',
		partName: 'Rail bracket',
		bomCode: 'RB-42',
		description: 'Left rail bracket',
		source: 'file'
	};

	it('binds a BOM row and clears candidates', () => {
		const resolved = resolvePartRefBomCandidate(
			{ ...partRefFromLabel('bracket'), candidateBomItemIds: ['bom-1', 'bom-2'] },
			bomItem
		);
		expect(resolved.bomItemId).toBe('bom-1');
		expect(resolved.bomCode).toBe('RB-42');
		expect(resolved.candidateBomItemIds).toBeUndefined();
	});

	it('trims whitespace from BOM item fields', () => {
		const resolved = resolvePartRefBomCandidate(partRefFromLabel('x'), {
			...bomItem,
			partName: '  Rail bracket  ',
			bomCode: ' RB-42 ',
			description: ' Left rail bracket '
		});
		expect(resolved.label).toBe('Rail bracket');
		expect(resolved.bomCode).toBe('RB-42');
		expect(resolved.description).toBe('Left rail bracket');
	});
});

describe('formatManualBomItem', () => {
	it('formats code + name', () => {
		const bomItem: ManualBomItem = {
			id: 'bom-1',
			partName: 'Rail bracket',
			bomCode: 'RB-42',
			description: 'Left rail bracket',
			source: 'file'
		};
		expect(formatManualBomItem(bomItem)).toBe('RB-42 — Rail bracket');
	});

	it('falls back to id when all fields are empty', () => {
		const empty: ManualBomItem = {
			id: 'bom-empty',
			partName: '',
			description: '',
			source: 'file'
		};
		expect(formatManualBomItem(empty)).toBe('bom-empty');
	});
});
