import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { extractAudio } from './audio.js';
import { splitIntoClips } from './clips.js';
import { makeOutDir, probeDurationMs, runFfmpeg } from './ffmpeg.js';
import { extractKeyframes } from './keyframes.js';
import { detectScenes } from './scenes.js';

// A 3s, 320x240@25fps fixture with two hard cuts (three distinct test patterns at 1s and
// 2s) and a 440Hz sine audio track — built on the fly with ffmpeg so no binary blob is
// committed. The unrelated patterns score ~0.8/~0.7 at the cuts (well above the 0.4
// threshold) and near-0 elsewhere, making scene detection deterministic.
async function buildFixture(dir: string): Promise<string> {
	const fileRef = join(dir, 'fixture.mp4');
	await runFfmpeg([
		'-f',
		'lavfi',
		'-i',
		'testsrc=s=320x240:d=1:r=25',
		'-f',
		'lavfi',
		'-i',
		'smptebars=s=320x240:d=1:r=25',
		'-f',
		'lavfi',
		'-i',
		'rgbtestsrc=s=320x240:d=1:r=25',
		'-f',
		'lavfi',
		'-i',
		'sine=frequency=440:duration=3',
		'-filter_complex',
		'[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]',
		'-map',
		'[v]',
		'-map',
		'3:a',
		'-c:v',
		'libx264',
		'-c:a',
		'aac',
		'-pix_fmt',
		'yuv420p',
		fileRef
	]);
	return fileRef;
}

const fileExists = (path: string) => stat(path).then(() => true);

describe('packages/media', () => {
	let workDir: string;
	let video: string;

	beforeAll(async () => {
		workDir = await makeOutDir('vitruvius-media-test-');
		video = await buildFixture(workDir);
	});

	afterAll(async () => {
		if (workDir) await rm(workDir, { recursive: true, force: true });
	});

	it('probes the fixture duration (~3s)', async () => {
		const durationMs = await probeDurationMs(video);
		expect(durationMs).toBeGreaterThan(2500);
		expect(durationMs).toBeLessThan(3500);
	});

	it('extracts candidate keyframes at the sampling interval', async () => {
		const frames = await extractKeyframes(video, { outDir: workDir, everyMs: 1000 });

		expect(frames.length).toBeGreaterThanOrEqual(3);
		expect(frames[0]!.atMs).toBe(0);
		// Timestamps strictly increase by the interval.
		for (let i = 1; i < frames.length; i++) {
			expect(frames[i]!.atMs).toBe(i * 1000);
		}
		await expect(fileExists(frames[0]!.fileRef)).resolves.toBe(true);
	});

	it('extracts the audio track', async () => {
		const audio = await extractAudio(video, { outDir: workDir });

		await expect(fileExists(audio.fileRef)).resolves.toBe(true);
		expect(audio.durationMs).toBeGreaterThan(2500);
	});

	it('detects scene boundaries at the hard cuts', async () => {
		const scenes = await detectScenes(video);

		expect(scenes.length).toBeGreaterThanOrEqual(2);
		// Boundaries are sorted and fall within the timeline, near the 1s and 2s cuts.
		for (const scene of scenes) {
			expect(scene.atMs).toBeGreaterThan(0);
			expect(scene.atMs).toBeLessThan(3000);
		}
	});

	it('splits the video into contiguous clips at explicit boundaries', async () => {
		const clips = await splitIntoClips(video, { outDir: workDir, boundaries: [1000, 2000] });

		expect(clips).toHaveLength(3);
		expect(clips[0]!.startMs).toBe(0);
		for (let i = 0; i < clips.length; i++) {
			await expect(fileExists(clips[i]!.fileRef)).resolves.toBe(true);
			if (i > 0) expect(clips[i]!.startMs).toBe(clips[i - 1]!.endMs);
		}
	});

	it('splits into a single clip when no boundaries are detected', async () => {
		const clips = await splitIntoClips(video, { outDir: workDir, boundaries: [] });

		expect(clips).toHaveLength(1);
		expect(clips[0]!.startMs).toBe(0);
		expect(clips[0]!.endMs).toBeGreaterThan(2500);
	});
});
