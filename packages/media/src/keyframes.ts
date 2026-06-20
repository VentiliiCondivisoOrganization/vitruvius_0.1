import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { makeOutDir, runFfmpeg } from './ffmpeg.js';
import type { Keyframe, KeyframeOptions } from './types.js';

const DEFAULT_EVERY_MS = 1000;

/**
 * Extract candidate keyframes at a fixed interval. The `fps` filter emits one frame per
 * interval starting at t≈0, so output frame `i` maps to `i * everyMs`. Returns the frames
 * sorted by timestamp; callers (the AI stage) pick representative stills per step.
 */
export async function extractKeyframes(
	videoPath: string,
	opts: KeyframeOptions = {}
): Promise<Keyframe[]> {
	const everyMs = opts.everyMs ?? DEFAULT_EVERY_MS;
	const outDir = opts.outDir ?? (await makeOutDir());
	const pattern = join(outDir, 'keyframe-%05d.jpg');

	// fps = 1000/everyMs frames per second; -q:v 2 keeps the JPEGs high quality.
	await runFfmpeg(['-i', videoPath, '-vf', `fps=1000/${everyMs}`, '-q:v', '2', pattern]);

	const files = (await readdir(outDir)).filter((f) => /^keyframe-\d+\.jpg$/.test(f)).sort();

	return files.map((file, index) => ({ atMs: index * everyMs, fileRef: join(outDir, file) }));
}
