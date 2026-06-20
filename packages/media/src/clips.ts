import { join } from 'node:path';
import { makeOutDir, probeDurationMs, runFfmpeg } from './ffmpeg.js';
import { detectScenes } from './scenes.js';
import type { Clip, ClipOptions } from './types.js';

/**
 * Split the video into contiguous clips at scene boundaries. When `boundaries` are not
 * supplied they are detected first. The boundaries plus 0 and the video duration define
 * the cut points; each segment is re-encoded (accurate seeking) into its own file. A
 * video with no detected scenes yields a single clip spanning the whole timeline.
 */
export async function splitIntoClips(videoPath: string, opts: ClipOptions = {}): Promise<Clip[]> {
	const outDir = opts.outDir ?? (await makeOutDir());
	const durationMs = await probeDurationMs(videoPath);

	const interior = (
		opts.boundaries ??
		(await detectScenes(videoPath, { threshold: opts.threshold })).map((s) => s.atMs)
	)
		.filter((ms) => ms > 0 && ms < durationMs)
		.sort((a, b) => a - b);

	// Cut points: [0, ...interior, duration] → consecutive pairs become clip ranges.
	const cuts = [0, ...interior, durationMs];
	const clips: Clip[] = [];

	for (let i = 0; i < cuts.length - 1; i++) {
		const startMs = cuts[i]!;
		const endMs = cuts[i + 1]!;
		if (endMs <= startMs) continue;

		const fileRef = join(outDir, `clip-${String(i).padStart(5, '0')}.mp4`);
		await runFfmpeg([
			'-ss',
			(startMs / 1000).toFixed(3),
			'-i',
			videoPath,
			'-t',
			((endMs - startMs) / 1000).toFixed(3),
			'-c:v',
			'libx264',
			'-c:a',
			'aac',
			'-pix_fmt',
			'yuv420p',
			fileRef
		]);
		clips.push({ startMs, endMs, fileRef });
	}

	return clips;
}
