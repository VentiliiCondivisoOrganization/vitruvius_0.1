import { createHash } from 'node:crypto';
import type { RawSegment } from './types.js';

export const SEGMENT_PROMPT_VERSION = 'segment-v1';

type CacheKeyInput = {
	promptVersion: string;
	videoUrl: string;
	videoDurationMs: number;
	keyframeTimesMs: number[];
	sceneBounds: { startMs: number; endMs: number }[];
	learnings: string[];
	window?: { startMs: number; endMs: number };
};

export function segmentCacheKey(input: CacheKeyInput): string {
	const payload = JSON.stringify(input);
	return createHash('sha256').update(payload).digest('hex');
}

/** In-process memoization — identical inputs are not re-billed in the same engine run. */
const cache = new Map<string, RawSegment[]>();

export function getCachedSegments(key: string): RawSegment[] | undefined {
	return cache.get(key);
}

export function setCachedSegments(key: string, steps: RawSegment[]): void {
	cache.set(key, steps);
}

/** Test-only: reset between test files. */
export function clearSegmentCache(): void {
	cache.clear();
}
