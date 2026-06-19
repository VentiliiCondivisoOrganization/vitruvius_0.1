import type { RawSegment } from './types.js';

export type SubChunkPlan = {
	startMs: number;
	endMs: number;
	reason: string;
};

/** Identify low-confidence or fast windows that deserve a focused re-segment pass. */
export function planSubChunks(
	segments: RawSegment[],
	options: { lowConfidenceThreshold: number; minSubChunkMs: number }
): SubChunkPlan[] {
	const plans: SubChunkPlan[] = [];

	for (const seg of segments) {
		const durationMs = seg.endMs - seg.startMs;
		const isShort = durationMs > 0 && durationMs < options.minSubChunkMs;
		const isLowConfidence = seg.confidence < options.lowConfidenceThreshold;

		if (isLowConfidence || (isShort && seg.confidence < 0.75)) {
			plans.push({
				startMs: seg.startMs,
				endMs: seg.endMs,
				reason: isLowConfidence ? 'low confidence' : 'short fast-action window'
			});
		}
	}

	return plans;
}
