import { ffprobePath, runCommand } from './ffmpeg.js';

type FfprobeFormat = { duration?: string };
type FfprobeStream = { codec_type?: string; codec_name?: string };
type FfprobeJson = {
	format?: FfprobeFormat;
	streams?: FfprobeStream[];
};

/** Duration of the container in milliseconds. */
export async function getVideoDurationMs(videoPath: string): Promise<number> {
	const { stdout } = await runCommand(ffprobePath(), [
		'-v',
		'error',
		'-show_entries',
		'format=duration',
		'-of',
		'json',
		videoPath
	]);

	const parsed = JSON.parse(stdout) as FfprobeJson;
	const seconds = Number(parsed.format?.duration);
	if (!Number.isFinite(seconds) || seconds <= 0) {
		throw new Error(`Could not read duration from ${videoPath}`);
	}
	return Math.round(seconds * 1000);
}

/** Whether the file has at least one audio stream ffmpeg can demux. */
export async function hasAudioStream(videoPath: string): Promise<boolean> {
	const { stdout } = await runCommand(ffprobePath(), [
		'-v',
		'error',
		'-select_streams',
		'a',
		'-show_entries',
		'stream=codec_type',
		'-of',
		'json',
		videoPath
	]);

	const parsed = JSON.parse(stdout) as FfprobeJson;
	return (parsed.streams?.length ?? 0) > 0;
}
