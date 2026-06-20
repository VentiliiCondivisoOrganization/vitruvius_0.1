import type { Keyframe } from '@vitruvius/media';
import { getSegmentProvider } from '../providers/segment-provider.js';
import { getCachedSegments, segmentCacheKey, setCachedSegments } from './cache.js';
import { planSubChunks } from './chunk-plan.js';
import { normalizeSegments } from './normalize.js';
import { scenesToIntervals } from './scenes.js';
import type { RawSegment, SegmentInput, SegmentWindow } from './types.js';

const DEFAULT_LOW_CONFIDENCE = 0.55;
const DEFAULT_MIN_SUB_CHUNK_MS = 2_500;

function sliceWindow(input: SegmentInput, startMs: number, endMs: number): SegmentWindow {
	const keyframes = input.keyframes.filter((kf) => kf.atMs >= startMs && kf.atMs < endMs);
	const scenes = scenesToIntervals(input.scenes, startMs, endMs);

	return { startMs, endMs, keyframes, scenes };
}

async function segmentWithCache(input: SegmentInput, window: SegmentWindow): Promise<RawSegment[]> {
	const learnings = input.learnings ?? [];
	const key = segmentCacheKey({
		promptVersion: 'segment-v1',
		videoUrl: input.videoUrl,
		videoDurationMs: input.videoDurationMs,
		keyframeTimesMs: window.keyframes.map((kf) => kf.atMs),
		sceneBounds: window.scenes,
		learnings,
		window: { startMs: window.startMs, endMs: window.endMs }
	});

	const cached = getCachedSegments(key);
	if (cached) return cached;

	const provider = getSegmentProvider();
	const raw = await provider.segmentWindow(window, {
		videoDurationMs: input.videoDurationMs,
		learnings,
		manualId: input.manualId
	});

	setCachedSegments(key, raw);
	return raw;
}

function mergeSubChunkResults(
	original: RawSegment[],
	replacements: { startMs: number; endMs: number; steps: RawSegment[] }[]
): RawSegment[] {
	if (replacements.length === 0) return original;

	let merged = [...original];
	for (const rep of replacements) {
		merged = merged.filter((seg) => !(seg.startMs >= rep.startMs && seg.endMs <= rep.endMs));
		merged.push(...rep.steps);
	}
	return merged;
}

/**
 * Segment an assembly video into ordered `RawSegment` drafts (spec 05).
 * Uses one primary provider call; sub-chunks only low-confidence / fast windows.
 */
export async function segmentIntoRawSteps(input: SegmentInput): Promise<RawSegment[]> {
	const fullWindow = sliceWindow(input, 0, input.videoDurationMs);
	const primary = await segmentWithCache(input, fullWindow);
	const normalized = normalizeSegments(primary, input.videoDurationMs);

	const lowConfidenceThreshold = input.lowConfidenceThreshold ?? DEFAULT_LOW_CONFIDENCE;
	const minSubChunkMs = input.minSubChunkMs ?? DEFAULT_MIN_SUB_CHUNK_MS;
	const subPlans = planSubChunks(normalized, { lowConfidenceThreshold, minSubChunkMs });

	const replacements: { startMs: number; endMs: number; steps: RawSegment[] }[] = [];
	for (const plan of subPlans) {
		const window = sliceWindow(input, plan.startMs, plan.endMs);
		if (window.keyframes.length === 0 && window.scenes.length <= 1) continue;

		const subSteps = await segmentWithCache(input, window);
		const subNormalized = normalizeSegments(subSteps, input.videoDurationMs).map((seg) => ({
			...seg,
			sourceNotes: [...seg.sourceNotes, `sub-chunk pass (${plan.reason})`]
		}));
		replacements.push({ startMs: plan.startMs, endMs: plan.endMs, steps: subNormalized });
	}

	const merged = mergeSubChunkResults(normalized, replacements);
	return normalizeSegments(merged, input.videoDurationMs);
}

/** Narrow keyframes to a window — exported for tests. */
export function keyframesInWindow(
	keyframes: Keyframe[],
	startMs: number,
	endMs: number
): Keyframe[] {
	return keyframes.filter((kf) => kf.atMs >= startMs && kf.atMs < endMs);
}
