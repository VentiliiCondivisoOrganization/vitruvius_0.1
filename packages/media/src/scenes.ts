import { assertFfmpegAvailable, assertVideoFile } from './ffmpeg.js';
import { getVideoDurationMs } from './probe.js';
import { detectSceneCutMs } from './scene-cuts.js';
import type { MediaWorkOptions, SceneBoundary } from './types.js';
import { boundariesFromCuts } from './workdir.js';

const DEFAULT_SCENE_THRESHOLD = 0.35;

/**
 * Detect scene-change boundaries via ffmpeg's scene score filter.
 * Returns contiguous intervals covering the full video — input for clip splitting
 * and a hint for the Segmenter (spec 05).
 */
export async function detectScenes(
	videoPath: string,
	options: MediaWorkOptions
): Promise<SceneBoundary[]> {
	await assertFfmpegAvailable();
	await assertVideoFile(videoPath);

	const threshold = options.sceneThreshold ?? DEFAULT_SCENE_THRESHOLD;
	const durationMs = await getVideoDurationMs(videoPath);
	const cutMs = await detectSceneCutMs(videoPath, threshold);

	return boundariesFromCuts(cutMs, durationMs);
}
