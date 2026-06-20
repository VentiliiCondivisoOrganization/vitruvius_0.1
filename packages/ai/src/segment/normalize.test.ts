import { describe, expect, it } from 'vitest';
import { normalizeSegments } from './normalize.js';

describe('normalizeSegments', () => {
	it('sorts and re-numbers overlapping segments', () => {
		const result = normalizeSegments(
			[
				{ order: 1, startMs: 3000, endMs: 6000, confidence: 0.8, sourceNotes: ['b'] },
				{ order: 0, startMs: 0, endMs: 3500, confidence: 0.9, sourceNotes: ['a'] }
			],
			10_000
		);
		expect(result[0]?.startMs).toBe(0);
		expect(result[1]?.startMs).toBeGreaterThanOrEqual(3500);
		expect(result.at(-1)?.endMs).toBe(10_000);
	});

	it('covers the full video when given an empty list', () => {
		const result = normalizeSegments([], 5000);
		expect(result).toEqual([
			{
				order: 0,
				startMs: 0,
				endMs: 5000,
				confidence: 0.4,
				sourceNotes: ['fallback: full video as one step']
			}
		]);
	});
});
