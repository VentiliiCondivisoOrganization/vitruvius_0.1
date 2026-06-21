import { manualStepSchema, type DigitalModel, type ManualStep } from '@vitruvius/core';
import { describe, expect, it } from 'vitest';
import { mapBomToSteps } from './map-steps.js';
import { parseBomCsv } from './parse-csv.js';
import { reconcileBom } from './reconcile.js';

const STEP_FIXTURE: ManualStep = manualStepSchema.parse({
	id: '11111111-1111-1111-1111-111111111111',
	order: 0,
	title: 'Mount the rail',
	instruction: '',
	caption: '',
	startMs: 0,
	endMs: 3000,
	keyframeUrl: '',
	illustrationUrl: '',
	tools: [],
	parts: [],
	warnings: [],
	confidence: 0.8,
	reviewStatus: 'hypothesis',
	sourceNotes: ['narrator mentions RAIL at 1200ms'],
	alternatives: [],
	critique: []
});

describe('parseBomCsv', () => {
	it('parses a headered CSV with code and name columns', () => {
		const rows = parseBomCsv(
			'part_number,part_name,description,qty\nRG-01,RAIL,Linear rail,1\nCR-02,CARRIAGE,Carriage,1'
		);
		expect(rows).toHaveLength(2);
		expect(rows[0]?.bomCode).toBe('RG-01');
		expect(rows[0]?.partName).toBe('RAIL');
	});
});

describe('reconcileBom', () => {
	it('merges CAD BOM with file rows by name', () => {
		const digitalModel: DigitalModel = {
			status: 'primed',
			source: { format: 'step', system: null, units: null, schema: null },
			bom: [{ name: 'RAIL', quantity: 1, sourceId: 'rail-1' }],
			assembly: [],
			geometry: null,
			views: [],
			contentHash: 'abc'
		};
		const fileRows = parseBomCsv('code,name,description\nRG-01,RAIL,Linear rail section');
		const merged = reconcileBom(digitalModel, fileRows);
		expect(merged).toHaveLength(1);
		expect(merged[0]?.source).toBe('cad');
		expect(merged[0]?.bomCode).toBe('RG-01');
	});
});

describe('mapBomToSteps', () => {
	it('resolves an unambiguous BOM mention without candidates', () => {
		const manualBom = reconcileBom(null, parseBomCsv('code,name\nRG-01,RAIL,Linear rail'));
		const result = mapBomToSteps({ steps: [STEP_FIXTURE], manualBom });
		expect(result.ambiguousStepOrders).toHaveLength(0);
		expect(result.steps[0]?.parts[0]?.bomItemId).toBeTruthy();
		expect(result.steps[0]?.parts[0]?.candidateBomItemIds).toBeUndefined();
	});

	it('flags ambiguous matches with candidate ids', () => {
		const manualBom = reconcileBom(null, parseBomCsv('code,name\nA-1,BRACKET A\nA-2,BRACKET B'));
		const step = {
			...STEP_FIXTURE,
			sourceNotes: ['bracket A and bracket B visible']
		};
		const result = mapBomToSteps({ steps: [step], manualBom });
		expect(result.ambiguousStepOrders).toContain(0);
		expect(result.steps[0]?.parts[0]?.candidateBomItemIds?.length).toBeGreaterThan(1);
	});

	it('produces generic labels for video-only input', () => {
		const result = mapBomToSteps({ steps: [STEP_FIXTURE], manualBom: [] });
		expect(result.steps[0]?.parts.length).toBeGreaterThan(0);
		expect(result.steps[0]?.parts[0]?.bomItemId).toBeNull();
	});
});
