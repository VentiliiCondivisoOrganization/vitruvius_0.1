import { describe, expect, it } from 'vitest';
import { scenesToIntervals } from './scenes.js';

describe('scenesToIntervals', () => {
	it('partitions a window at interior boundaries', () => {
		expect(scenesToIntervals([{ atMs: 3000 }, { atMs: 6000 }], 0, 9000)).toEqual([
			{ startMs: 0, endMs: 3000 },
			{ startMs: 3000, endMs: 6000 },
			{ startMs: 6000, endMs: 9000 }
		]);
	});

	it('returns a single interval when no boundary falls inside the window', () => {
		expect(scenesToIntervals([], 0, 9000)).toEqual([{ startMs: 0, endMs: 9000 }]);
	});

	it('ignores boundaries on or outside the window edges', () => {
		expect(scenesToIntervals([{ atMs: 0 }, { atMs: 4000 }, { atMs: 9000 }], 2000, 8000)).toEqual([
			{ startMs: 2000, endMs: 4000 },
			{ startMs: 4000, endMs: 8000 }
		]);
	});

	it('deduplicates coincident boundaries', () => {
		expect(scenesToIntervals([{ atMs: 5000 }, { atMs: 5000 }], 0, 10000)).toEqual([
			{ startMs: 0, endMs: 5000 },
			{ startMs: 5000, endMs: 10000 }
		]);
	});

	it('yields nothing for a degenerate window', () => {
		expect(scenesToIntervals([{ atMs: 1000 }], 5000, 5000)).toEqual([]);
	});
});
