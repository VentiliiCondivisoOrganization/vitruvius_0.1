import type { SceneBoundary } from '@vitruvius/media';
import type { SceneInterval } from './types.js';

/**
 * Turn `@vitruvius/media` scene boundaries (points where a new scene begins, 0ms
 * implicit) into closed intervals clipped to `[startMs, endMs]`. The boundaries that
 * fall strictly inside the window are interior cut points; the window edges are the
 * outer bounds — the same pairing `@vitruvius/media`'s `splitIntoClips` uses for cuts.
 *
 * A continuous window with no interior boundary yields a single `[startMs, endMs]`
 * interval. An empty/degenerate window (`startMs >= endMs`) yields no intervals.
 */
export function scenesToIntervals(
	scenes: SceneBoundary[],
	startMs: number,
	endMs: number
): SceneInterval[] {
	if (startMs >= endMs) return [];

	const cuts = scenes
		.map((sc) => sc.atMs)
		.filter((atMs) => atMs > startMs && atMs < endMs)
		.sort((a, b) => a - b);

	const bounds = [startMs, ...dedupe(cuts), endMs];
	const intervals: SceneInterval[] = [];
	for (let i = 0; i < bounds.length - 1; i += 1) {
		intervals.push({ startMs: bounds[i]!, endMs: bounds[i + 1]! });
	}
	return intervals;
}

function dedupe(sorted: number[]): number[] {
	return sorted.filter((value, index) => index === 0 || value !== sorted[index - 1]);
}
