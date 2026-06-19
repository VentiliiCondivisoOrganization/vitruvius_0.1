import { join } from 'node:path';
import { assertFfmpegAvailable, assertVideoFile, ffmpegPath, runCommand } from './ffmpeg.js';
import { getVideoDurationMs } from './probe.js';
import { detectSceneCutMs } from './scene-cuts.js';
import type { Keyframe, MediaWorkOptions } from './types.js';
import { ensureOutputDir, subdir } from './workdir.js';

const DEFAULT_SCENE_THRESHOLD = 0.35;
const DEFAULT_MAX_KEYFRAMES = 48;

/**
 * Extract candidate still frames at scene changes (and periodic samples on long static
 * stretches). Outputs JPEG file refs for downstream AI priming — not final IKEA illustrations.
 */
export async function extractKeyframes(
	videoPath: string,
	options: MediaWorkOptions
): Promise<Keyframe[]> {
	await assertFfmpegAvailable();
	await assertVideoFile(videoPath);

	const maxKeyframes = options.maxKeyframes ?? DEFAULT_MAX_KEYFRAMES;
	const threshold = options.sceneThreshold ?? DEFAULT_SCENE_THRESHOLD;
	const durationMs = await getVideoDurationMs(videoPath);
	const outDir = subdir(options.outputDir, 'keyframes');
	await ensureOutputDir(outDir);

	const timesMs = pickKeyframeTimesMs(
		await detectSceneCutMs(videoPath, threshold),
		durationMs,
		maxKeyframes
	);

	const keyframes: Keyframe[] = [];
	for (let i = 0; i < timesMs.length; i++) {
		const atMs = timesMs[i]!;
		const fileRef = join(outDir, `frame_${String(i + 1).padStart(4, '0')}.jpg`);
		await runCommand(ffmpegPath(), [
			'-hide_banner',
			'-loglevel',
			'error',
			'-ss',
			(atMs / 1000).toFixed(3),
			'-i',
			videoPath,
			'-frames:v',
			'1',
			'-q:v',
			'2',
			'-y',
			fileRef
		]);
		keyframes.push({ atMs, fileRef });
	}

	return keyframes;
}

function pickKeyframeTimesMs(
	sceneCutMs: number[],
	durationMs: number,
	maxKeyframes: number
): number[] {
	const periodic = periodicSampleTimesMs(durationMs, maxKeyframes);
	const merged = [...new Set([0, ...sceneCutMs, ...periodic])]
		.filter((t) => t >= 0 && t < durationMs)
		.sort((a, b) => a - b);

	if (merged.length === 0) {
		return [0];
	}

	return merged.slice(0, maxKeyframes);
}

/** Sample every N seconds so long static assembly shots still yield frames. */
function periodicSampleTimesMs(durationMs: number, maxKeyframes: number): number[] {
	if (durationMs <= 0) return [];
	const intervalMs = Math.max(5_000, Math.ceil(durationMs / Math.max(maxKeyframes, 1)));
	const times: number[] = [];
	for (let t = intervalMs; t < durationMs; t += intervalMs) {
		times.push(t);
	}
	return times;
}
