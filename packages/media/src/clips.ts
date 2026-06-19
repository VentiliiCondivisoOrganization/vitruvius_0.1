import { join } from 'node:path';
import { assertFfmpegAvailable, assertVideoFile, ffmpegPath, runCommand } from './ffmpeg.js';
import { getVideoDurationMs, hasAudioStream } from './probe.js';
import { detectScenes } from './scenes.js';
import type { Clip, MediaWorkOptions, SceneBoundary } from './types.js';
import { ensureOutputDir, subdir } from './workdir.js';

/**
 * Split the source video into scene-aligned clips on disk.
 * Re-encodes segments for clean cuts (assembly videos rarely have keyframes at scene edges).
 */
export async function splitIntoClips(
	videoPath: string,
	options: MediaWorkOptions,
	boundaries?: SceneBoundary[]
): Promise<Clip[]> {
	await assertFfmpegAvailable();
	await assertVideoFile(videoPath);

	const scenes = boundaries ?? (await detectScenes(videoPath, options));
	if (scenes.length === 0) {
		const durationMs = await getVideoDurationMs(videoPath);
		scenes.push({ startMs: 0, endMs: durationMs });
	}

	const outDir = subdir(options.outputDir, 'clips');
	await ensureOutputDir(outDir);
	const withAudio = await hasAudioStream(videoPath);

	const clips: Clip[] = [];
	for (let i = 0; i < scenes.length; i++) {
		const scene = scenes[i]!;
		const fileRef = join(outDir, `clip_${String(i + 1).padStart(3, '0')}.mp4`);
		const startSec = (scene.startMs / 1000).toFixed(3);
		const durationSec = ((scene.endMs - scene.startMs) / 1000).toFixed(3);

		const args = [
			'-hide_banner',
			'-loglevel',
			'error',
			'-ss',
			startSec,
			'-i',
			videoPath,
			'-t',
			durationSec,
			'-c:v',
			'libx264',
			'-preset',
			'veryfast',
			'-crf',
			'23',
			...(withAudio ? ['-c:a', 'aac', '-b:a', '128k'] : ['-an']),
			'-movflags',
			'+faststart',
			'-y',
			fileRef
		];

		await runCommand(ffmpegPath(), args);
		clips.push({ ...scene, fileRef });
	}

	return clips;
}
