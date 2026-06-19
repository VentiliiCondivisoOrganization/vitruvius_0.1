import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { FfmpegCommandError, FfmpegNotFoundError } from './errors.js';

export type CommandResult = { stdout: string; stderr: string };

export function ffmpegPath(): string {
	return process.env.FFMPEG_PATH ?? 'ffmpeg';
}

export function ffprobePath(): string {
	return process.env.FFPROBE_PATH ?? 'ffprobe';
}

/** Verify ffmpeg/ffprobe are invokable before starting expensive work. */
export async function assertFfmpegAvailable(): Promise<void> {
	try {
		await runCommand(ffmpegPath(), ['-version']);
		await runCommand(ffprobePath(), ['-version']);
	} catch (err) {
		if (isSpawnNotFound(err)) {
			throw new FfmpegNotFoundError();
		}
		throw err;
	}
}

export async function assertVideoFile(videoPath: string): Promise<void> {
	try {
		await access(videoPath, constants.R_OK);
	} catch (err) {
		throw new Error(`Video file is not readable: ${videoPath}`, { cause: err });
	}
}

export function runCommand(command: string, args: readonly string[]): Promise<CommandResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';

		child.stdout.on('data', (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		child.stderr.on('data', (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		child.on('error', (err) => {
			if (isSpawnNotFound(err)) {
				reject(new FfmpegNotFoundError());
				return;
			}
			reject(err);
		});

		child.on('close', (code) => {
			if (code === 0) {
				resolve({ stdout, stderr });
				return;
			}
			reject(new FfmpegCommandError(command, args, code, stderr));
		});
	});
}

function isSpawnNotFound(err: unknown): boolean {
	return err instanceof Error && 'code' in err && err.code === 'ENOENT';
}
