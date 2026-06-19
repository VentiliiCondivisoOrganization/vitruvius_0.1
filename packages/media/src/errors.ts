export class MediaError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'MediaError';
	}
}

export class FfmpegNotFoundError extends MediaError {
	constructor() {
		super('ffmpeg/ffprobe not found on PATH. Install ffmpeg or set FFMPEG_PATH / FFPROBE_PATH.');
		this.name = 'FfmpegNotFoundError';
	}
}

export class FfmpegCommandError extends MediaError {
	readonly command: string;
	readonly args: readonly string[];
	readonly exitCode: number | null;
	readonly stderr: string;

	constructor(command: string, args: readonly string[], exitCode: number | null, stderr: string) {
		const detail = stderr.trim().split('\n').at(-1) ?? 'unknown ffmpeg error';
		super(`${command} failed (code ${exitCode ?? 'null'}): ${detail}`);
		this.name = 'FfmpegCommandError';
		this.command = command;
		this.args = args;
		this.exitCode = exitCode;
		this.stderr = stderr;
	}
}
