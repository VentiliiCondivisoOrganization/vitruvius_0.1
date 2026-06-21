import { manualStepSchema, partRefFromLabel, type ManualStep } from '@vitruvius/core';
import { describe, expect, it } from 'vitest';
import { mergeInstruction } from './merge.js';
import type { RawInstruction } from './types.js';

const original: ManualStep = manualStepSchema.parse({
	id: '33333333-3333-3333-3333-333333333333',
	order: 2,
	title: 'Step 3',
	instruction: '',
	startMs: 6000,
	endMs: 9000,
	keyframeUrl: 'file:///tmp/frame_0003.jpg',
	tools: [],
	parts: [],
	warnings: [],
	confidence: 0.6,
	reviewStatus: 'hypothesis',
	sourceNotes: ['existing note'],
	alternatives: []
});

const raw: RawInstruction = {
	order: 2,
	title: 'Seat the shelf',
	instruction: 'Slide the shelf onto the pins.',
	tools: ['mallet'],
	parts: ['shelf'],
	warnings: ['do not force'],
	alternatives: ['tap gently with a soft mallet'],
	addedSourceNotes: ['existing note', 'mallet visible in keyframe', '  ']
};

describe('mergeInstruction', () => {
	it('fills operative fields while preserving segmentation facts', () => {
		const merged = mergeInstruction(original, raw);
		expect(merged.id).toBe(original.id);
		expect(merged.order).toBe(original.order);
		expect(merged.startMs).toBe(original.startMs);
		expect(merged.endMs).toBe(original.endMs);
		expect(merged.confidence).toBe(original.confidence);
		expect(merged.reviewStatus).toBe('hypothesis');
		expect(merged.title).toBe('Seat the shelf');
		expect(merged.instruction).toBe('Slide the shelf onto the pins.');
		expect(merged.tools).toEqual(['mallet']);
	});

	it('merges source notes without duplicates or blanks', () => {
		const merged = mergeInstruction(original, raw);
		expect(merged.sourceNotes).toEqual(['existing note', 'mallet visible in keyframe']);
	});

	it('falls back to the original title when the model returns blank', () => {
		const merged = mergeInstruction(original, { ...raw, title: '   ' });
		expect(merged.title).toBe('Step 3');
	});

	it('preserves the original instruction when the model returns whitespace', () => {
		const withInstruction = { ...original, instruction: 'existing instruction' };
		const merged = mergeInstruction(withInstruction, { ...raw, instruction: '   ' });
		expect(merged.instruction).toBe('existing instruction');
	});

	it('trims and drops blank entries from operative lists', () => {
		const merged = mergeInstruction(original, {
			...raw,
			tools: ['  mallet  ', '   ', ''],
			parts: ['shelf', '  ']
		});
		expect(merged.tools).toEqual(['mallet']);
		expect(merged.parts).toEqual([partRefFromLabel('shelf')]);
	});

	it('preserves BOM-mapped parts when the instructor returns string labels', () => {
		const withParts = {
			...original,
			parts: [partRefFromLabel('mapped rail')]
		};
		const merged = mergeInstruction(withParts, { ...raw, parts: ['ignored shelf'] });
		expect(merged.parts).toEqual(withParts.parts);
	});
});
