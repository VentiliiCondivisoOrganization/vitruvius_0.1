// ffmpeg wrappers for the engine pipeline (spec 04-media).
// Engine-only — never imported by apps/web.

export { extractAudio } from './audio.js';
export { splitIntoClips } from './clips.js';
export { FfmpegCommandError, FfmpegNotFoundError, MediaError } from './errors.js';
export { assertFfmpegAvailable, ffmpegPath, ffprobePath } from './ffmpeg.js';
export { extractKeyframes } from './keyframes.js';
export { getVideoDurationMs, hasAudioStream } from './probe.js';
export { detectScenes } from './scenes.js';
export type { AudioTrack, Clip, Keyframe, MediaWorkOptions, SceneBoundary } from './types.js';
