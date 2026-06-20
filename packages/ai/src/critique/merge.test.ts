import { manualStepSchema, type ManualStep } from '@vitruvius/core';
import { describe, expect, it } from 'vitest';
import { mergeCritique } from './merge.js';

const original: ManualStep = manualStepSchema.parse({
	id: '33333333-3333-3333-3333-333333333333',
	order: 2,
	title: 'Seat the shelf',
	instruction: 'Slide the shelf onto the pins.',
	startMs: 6000,
	endMs: 9000,
	keyframeUrl: 'file:///tmp/frame_0003.jpg',
	tools: ['mallet'],
	parts: ['shelf'],
	warnings: ['do not force'],
	confidence: 0.6,
	reviewStatus: 'hypothesis',
	sourceNotes: ['shelf seated at 7000ms'],
	alternatives: []
});

describe('mergeCritique', () => {
	it('sets critique and lowers confidence while preserving generated fields', () => {
		const merged = mergeCritique(original, {
			order: 2,
			confidence: 0.3,
			critique: ['mallet not visible in any source note']
		});
		expect(merged.confidence).toBe(0.3);
		expect(merged.critique).toEqual(['mallet not visible in any source note']);
		expect(merged.instruction).toBe(original.instruction);
		expect(merged.tools).toEqual(original.tools);
		expect(merged.sourceNotes).toEqual(original.sourceNotes);
	});

	it('never raises confidence above the original', () => {
		const merged = mergeCritique(original, { order: 2, confidence: 0.95, critique: [] });
		expect(merged.confidence).toBe(original.confidence);
	});

	it('trims and drops blank critique entries', () => {
		const merged = mergeCritique(original, {
			order: 2,
			confidence: 0.4,
			critique: ['  real flag  ', '   ', '']
		});
		expect(merged.critique).toEqual(['real flag']);
	});
});
