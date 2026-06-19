import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function ensureOutputDir(outputDir: string): Promise<void> {
	await mkdir(outputDir, { recursive: true });
}

export function subdir(outputDir: string, name: string): string {
	return join(outputDir, name);
}

/** Convert ffmpeg's floating seconds to integer milliseconds. */
export function secondsToMs(seconds: number): number {
	return Math.max(0, Math.round(seconds * 1000));
}

/** Merge scene cut timestamps with video bounds into contiguous intervals. */
export function boundariesFromCuts(
	cutMs: number[],
	durationMs: number
): { startMs: number; endMs: number }[] {
	const sorted = [...new Set(cutMs.filter((t) => t > 0 && t < durationMs))].sort((a, b) => a - b);
	const edges = [0, ...sorted, durationMs];
	const scenes: { startMs: number; endMs: number }[] = [];

	for (let i = 0; i < edges.length - 1; i++) {
		const startMs = edges[i]!;
		const endMs = edges[i + 1]!;
		if (endMs > startMs) {
			scenes.push({ startMs, endMs });
		}
	}

	return scenes.length > 0 ? scenes : [{ startMs: 0, endMs: durationMs }];
}
