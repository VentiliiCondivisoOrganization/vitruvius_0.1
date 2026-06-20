// Intermediate shapes produced by the media stage and consumed downstream by
// packages/ai. These are engine-internal — they never cross the web⇄engine boundary,
// so they live here rather than in @vitruvius/core (which holds only the shared
// ManualStep / InstructionManual / Job contract). `fileRef` is an absolute local path
// inside the engine container; the engine uploads it to Storage when persisting.

/** A single still extracted from the video, tagged with its source timestamp. */
export interface Keyframe {
	atMs: number;
	fileRef: string;
}

/** The extracted audio track, ready for transcription downstream. */
export interface AudioTrack {
	fileRef: string;
	durationMs: number;
}

/** A detected scene change, expressed as the timestamp where the new scene begins. */
export interface SceneBoundary {
	atMs: number;
}

/** A contiguous slice of the source video written to its own file. */
export interface Clip {
	startMs: number;
	endMs: number;
	fileRef: string;
}

/** Options shared by wrappers that write files to disk. */
export interface OutputDirOption {
	/** Directory to write outputs into. Defaults to a fresh OS temp directory. */
	outDir?: string;
}

export interface KeyframeOptions extends OutputDirOption {
	/** Sampling interval between candidate keyframes, in ms. Default 1000. */
	everyMs?: number;
}

export interface AudioOptions extends OutputDirOption {
	/** Output sample rate in Hz. Default 16000 (speech-friendly). */
	sampleRate?: number;
	/** Output channel count. Default 1 (mono). */
	channels?: number;
}

export interface SceneOptions {
	/** Scene-change score threshold in [0,1]; higher = fewer cuts. Default 0.4. */
	threshold?: number;
}

export interface ClipOptions extends OutputDirOption, SceneOptions {
	/**
	 * Interior cut points in ms. When omitted, scenes are detected first and used as
	 * the cut points; 0 and the video duration are always added as the outer bounds.
	 */
	boundaries?: number[];
}
