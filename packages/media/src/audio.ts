import { join } from 'node:path';
import { assertFfmpegAvailable, assertVideoFile, ffmpegPath, runCommand } from './ffmpeg.js';
import { getVideoDurationMs, hasAudioStream } from './probe.js';
import type { AudioTrack, MediaWorkOptions } from './types.js';
import { ensureOutputDir, subdir } from './workdir.js';

/**
 * Demux the audio track to a standalone file for downstream transcription / BOM hints.
 * Returns null when the source has no audio — common for silent assembly footage.
 */
export async function extractAudio(
	videoPath: string,
	options: MediaWorkOptions
): Promise<AudioTrack | null> {
	await assertFfmpegAvailable();
	await assertVideoFile(videoPath);

	if (!(await hasAudioStream(videoPath))) {
		return null;
	}

	const outDir = subdir(options.outputDir, 'audio');
	await ensureOutputDir(outDir);
	const fileRef = join(outDir, 'track.m4a');

	await runCommand(ffmpegPath(), [
		'-hide_banner',
		'-loglevel',
		'error',
		'-i',
		videoPath,
		'-vn',
		'-c:a',
		'aac',
		'-b:a',
		'128k',
		'-y',
		fileRef
	]);

	const durationMs = await getVideoDurationMs(fileRef);
	return { fileRef, durationMs };
}
