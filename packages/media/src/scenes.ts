import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { makeOutDir, runFfmpeg } from './ffmpeg.js';
import type { SceneBoundary, SceneOptions } from './types.js';

const DEFAULT_THRESHOLD = 0.4;

/**
 * Detect scene-change boundaries via ffmpeg's `scene` score. The `select` filter keeps
 * only frames whose score exceeds the threshold, and `metadata=print` writes one record
 * per kept frame; we parse the `pts_time` of each into a boundary timestamp. The implicit
 * start of the video (0ms) is not reported as a boundary.
 */
export async function detectScenes(
	videoPath: string,
	opts: SceneOptions = {}
): Promise<SceneBoundary[]> {
	const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
	const outDir = await makeOutDir();
	const metaFile = join(outDir, 'scenes.txt');

	// Write metadata to a file (not stdout) so it can't interleave with the null muxer.
	await runFfmpeg([
		'-i',
		videoPath,
		'-vf',
		`select='gt(scene,${threshold})',metadata=print:file=${metaFile}`,
		'-an',
		'-f',
		'null',
		'-'
	]);

	let report: string;
	try {
		report = await readFile(metaFile, 'utf8');
	} catch {
		// No frame cleared the threshold → ffmpeg may not create the file at all.
		report = '';
	} finally {
		await rm(outDir, { recursive: true, force: true });
	}

	const boundaries: SceneBoundary[] = [];
	for (const match of report.matchAll(/pts_time:(\d+(?:\.\d+)?)/g)) {
		boundaries.push({ atMs: Math.round(Number.parseFloat(match[1]!) * 1000) });
	}
	return boundaries;
}
