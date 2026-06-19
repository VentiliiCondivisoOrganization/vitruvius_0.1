/** A still frame extracted from the source video for AI priming / step keyframes. */
export type Keyframe = { atMs: number; fileRef: string };

/** A detected scene interval in the source video (no separate file yet). */
export type SceneBoundary = { startMs: number; endMs: number };

/** A video segment written to disk, bounded by scene changes or caller-supplied cuts. */
export type Clip = SceneBoundary & { fileRef: string };

/** Where to write extracted artifacts and optional tuning knobs. */
export type MediaWorkOptions = {
	outputDir: string;
	/** Scene-change sensitivity for ffmpeg's `scene` score (0..1). Default 0.35. */
	sceneThreshold?: number;
	/** Upper bound on keyframes returned (protects against noisy inputs). Default 48. */
	maxKeyframes?: number;
};

export type AudioTrack = {
	fileRef: string;
	durationMs: number;
};
