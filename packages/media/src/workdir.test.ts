import { describe, expect, it } from 'vitest';
import { boundariesFromCuts } from './workdir.js';

describe('boundariesFromCuts', () => {
	it('covers the full duration with contiguous intervals', () => {
		const scenes = boundariesFromCuts([1_000, 2_000], 3_000);
		expect(scenes).toEqual([
			{ startMs: 0, endMs: 1_000 },
			{ startMs: 1_000, endMs: 2_000 },
			{ startMs: 2_000, endMs: 3_000 }
		]);
	});

	it('returns one scene when no cuts are detected', () => {
		expect(boundariesFromCuts([], 5_000)).toEqual([{ startMs: 0, endMs: 5_000 }]);
	});

	it('ignores cuts outside the video bounds', () => {
		expect(boundariesFromCuts([-100, 0, 5_000, 9_000], 4_000)).toEqual([
			{ startMs: 0, endMs: 4_000 }
		]);
	});
});
