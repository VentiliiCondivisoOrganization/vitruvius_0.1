import { join } from 'node:path';
import { makeOutDir, probeDurationMs, runFfmpeg } from './ffmpeg.js';
import type { AudioOptions, AudioTrack } from './types.js';

const DEFAULT_SAMPLE_RATE = 16_000;
const DEFAULT_CHANNELS = 1;

/**
 * Extract the audio track as 16-bit PCM WAV (16kHz mono by default) — an uncompressed,
 * transcription-friendly format for the downstream AI stage. A video with no audio
 * stream yields no file and would surface as an FfmpegError, so callers that allow
 * silent videos should guard accordingly.
 */
export async function extractAudio(
	videoPath: string,
	opts: AudioOptions = {}
): Promise<AudioTrack> {
	const sampleRate = opts.sampleRate ?? DEFAULT_SAMPLE_RATE;
	const channels = opts.channels ?? DEFAULT_CHANNELS;
	const outDir = opts.outDir ?? (await makeOutDir());
	const fileRef = join(outDir, 'audio.wav');

	await runFfmpeg([
		'-i',
		videoPath,
		'-vn', // drop video
		'-acodec',
		'pcm_s16le',
		'-ar',
		String(sampleRate),
		'-ac',
		String(channels),
		fileRef
	]);

	return { fileRef, durationMs: await probeDurationMs(fileRef) };
}
