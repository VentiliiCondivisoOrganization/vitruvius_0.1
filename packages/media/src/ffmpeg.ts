// Thin wrappers around the system `ffmpeg` / `ffprobe` binaries. These live in the
// engine container (see apps/engine/Dockerfile) — never in apps/web. Shelling out to
// the system binaries keeps the package dependency-free; the binary paths are
// overridable via env so a self-hoster can point at their own build.

import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const FFMPEG_BIN = process.env.FFMPEG_PATH ?? 'ffmpeg';
const FFPROBE_BIN = process.env.FFPROBE_PATH ?? 'ffprobe';

// ffmpeg/ffprobe report progress and metadata on stderr/stdout; a long video can emit
// a lot, so lift the child-process buffer cap well above the 1MB default.
const MAX_BUFFER = 64 * 1024 * 1024;

/** A subprocess exited non-zero; carries the tail of stderr for a useful message. */
export class FfmpegError extends Error {
	constructor(
		readonly bin: string,
		readonly args: readonly string[],
		readonly stderr: string,
		options?: { cause?: unknown }
	) {
		const tail = stderr.trim().split('\n').slice(-8).join('\n');
		super(`${bin} failed: ${args.join(' ')}\n${tail}`, options);
		this.name = 'FfmpegError';
	}
}

async function run(
	bin: string,
	args: readonly string[]
): Promise<{ stdout: string; stderr: string }> {
	try {
		return await execFileAsync(bin, args as string[], { maxBuffer: MAX_BUFFER });
	} catch (err) {
		const stderr = typeof err === 'object' && err && 'stderr' in err ? String(err.stderr) : '';
		throw new FfmpegError(bin, args, stderr, { cause: err });
	}
}

/** Run ffmpeg with the given args; `-nostdin`/`-y` are prepended so it never blocks or prompts. */
export function runFfmpeg(args: readonly string[]): Promise<{ stdout: string; stderr: string }> {
	return run(FFMPEG_BIN, ['-hide_banner', '-nostdin', '-y', ...args]);
}

/** Run ffprobe with the given args. */
export function runFfprobe(args: readonly string[]): Promise<{ stdout: string; stderr: string }> {
	return run(FFPROBE_BIN, ['-hide_banner', ...args]);
}

/** Container duration in whole milliseconds, via ffprobe. */
export async function probeDurationMs(videoPath: string): Promise<number> {
	const args = [
		'-v',
		'error',
		'-show_entries',
		'format=duration',
		'-of',
		'default=nokey=1:noprint_wrappers=1',
		videoPath
	];
	const { stdout } = await runFfprobe(args);
	const seconds = Number.parseFloat(stdout.trim());
	if (!Number.isFinite(seconds)) {
		throw new FfmpegError(FFPROBE_BIN, args, `could not parse duration from: ${stdout}`);
	}
	return Math.round(seconds * 1000);
}

/** Create a fresh temp directory for media outputs, returning its absolute path. */
export function makeOutDir(prefix = 'vitruvius-media-'): Promise<string> {
	return mkdtemp(join(tmpdir(), prefix));
}
