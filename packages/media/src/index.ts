// packages/media — ffmpeg/ffprobe extraction utilities for the engine pipeline.
// Engine-only: ffmpeg lives in the engine container, never in apps/web. Every function
// shells out to the system binaries and returns structured results (timestamps + file
// refs), not raw ffmpeg output. AI interpretation of these frames/audio is specs 05–06.

export { extractAudio } from './audio.js';
export { splitIntoClips } from './clips.js';
export { FfmpegError, probeDurationMs } from './ffmpeg.js';
export { extractKeyframes } from './keyframes.js';
export { detectScenes } from './scenes.js';
export type {
	AudioOptions,
	AudioTrack,
	Clip,
	ClipOptions,
	Keyframe,
	KeyframeOptions,
	OutputDirOption,
	SceneBoundary,
	SceneOptions
} from './types.js';
