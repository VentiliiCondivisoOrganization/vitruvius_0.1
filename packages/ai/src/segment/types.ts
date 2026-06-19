import type { AudioTrack, Clip, Keyframe, SceneBoundary } from '@vitruvius/media';

/** Media artifacts produced by `@vitruvius/media` (spec 04) — priming context for segmentation. */
export type SegmentMediaContext = {
	videoUrl: string;
	videoDurationMs: number;
	keyframes: Keyframe[];
	scenes: SceneBoundary[];
	clips: Clip[];
	audio: AudioTrack | null;
};

/** Optional priming from the learnings store (spec 11) — empty when not yet implemented. */
export type SegmentOptions = {
	learnings?: string[];
	manualId?: string;
	/** Scene-change sensitivity forwarded to sub-chunk planning. Default 0.35. */
	sceneThreshold?: number;
	/** Re-segment windows whose model confidence falls below this. Default 0.55. */
	lowConfidenceThreshold?: number;
	/** Minimum step length (ms) before a low-confidence window is sub-chunked. Default 2500. */
	minSubChunkMs?: number;
};

export type SegmentInput = SegmentMediaContext & SegmentOptions;

/** One step as returned by a model provider before mapping to `ManualStep`. */
export type RawSegment = {
	order: number;
	startMs: number;
	endMs: number;
	confidence: number;
	sourceNotes: string[];
	label?: string;
};

/** A time window passed to a provider for primary or sub-chunk segmentation. */
export type SegmentWindow = {
	startMs: number;
	endMs: number;
	keyframes: Keyframe[];
	scenes: SceneBoundary[];
};
