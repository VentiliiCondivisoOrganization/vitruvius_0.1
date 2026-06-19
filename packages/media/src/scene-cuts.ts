import { ffmpegPath, runCommand } from './ffmpeg.js';
import { secondsToMs } from './workdir.js';

const SHOWINFO_PTS_RE = /pts_time:([0-9.]+)/g;

/** Timestamps (ms) where ffmpeg's scene score exceeds the threshold. */
export async function detectSceneCutMs(videoPath: string, threshold: number): Promise<number[]> {
	const filter = `select='gt(scene,${threshold})',showinfo`;
	const { stderr } = await runCommand(ffmpegPath(), [
		'-hide_banner',
		'-loglevel',
		'info',
		'-i',
		videoPath,
		'-filter:v',
		filter,
		'-f',
		'null',
		'-'
	]);

	const cuts: number[] = [];
	for (const match of stderr.matchAll(SHOWINFO_PTS_RE)) {
		const seconds = Number(match[1]);
		if (Number.isFinite(seconds)) {
			cuts.push(secondsToMs(seconds));
		}
	}

	return cuts;
}
