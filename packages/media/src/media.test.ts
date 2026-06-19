import { constants } from 'node:fs';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ffmpegPath, runCommand } from './ffmpeg.js';
import {
	assertFfmpegAvailable,
	detectScenes,
	extractAudio,
	extractKeyframes,
	getVideoDurationMs,
	splitIntoClips
} from './index.js';

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path, constants.R_OK);
		return true;
	} catch {
		return false;
	}
}

/** Three solid-color panels — gives ffmpeg scene scores something to latch onto. */
async function buildSilentFixture(outPath: string): Promise<void> {
	await runCommand(ffmpegPath(), [
		'-hide_banner',
		'-loglevel',
		'error',
		'-f',
		'lavfi',
		'-i',
		'color=c=red:s=320x240:r=30:d=1',
		'-f',
		'lavfi',
		'-i',
		'color=c=blue:s=320x240:r=30:d=1',
		'-f',
		'lavfi',
		'-i',
		'color=c=green:s=320x240:r=30:d=1',
		'-filter_complex',
		'[0:v][1:v][2:v]concat=n=3:v=1:a=0[vout]',
		'-map',
		'[vout]',
		'-c:v',
		'libx264',
		'-pix_fmt',
		'yuv420p',
		'-y',
		outPath
	]);
}

async function buildAudioFixture(outPath: string): Promise<void> {
	await runCommand(ffmpegPath(), [
		'-hide_banner',
		'-loglevel',
		'error',
		'-f',
		'lavfi',
		'-i',
		'testsrc=size=320x240:rate=30:duration=2',
		'-f',
		'lavfi',
		'-i',
		'sine=frequency=440:duration=2',
		'-c:v',
		'libx264',
		'-pix_fmt',
		'yuv420p',
		'-c:a',
		'aac',
		'-shortest',
		'-y',
		outPath
	]);
}

describe('media integration (ffmpeg)', () => {
	let fixtureRoot: string;
	let silentVideo: string;
	let audioVideo: string;
	let ffmpegReady = false;

	beforeAll(async () => {
		try {
			await assertFfmpegAvailable();
			ffmpegReady = true;
		} catch {
			return;
		}

		fixtureRoot = await mkdtemp(join(tmpdir(), 'vitruvius-media-'));
		silentVideo = join(fixtureRoot, 'silent.mp4');
		audioVideo = join(fixtureRoot, 'with-audio.mp4');
		await buildSilentFixture(silentVideo);
		await buildAudioFixture(audioVideo);
	}, 120_000);

	afterAll(async () => {
		if (fixtureRoot) {
			await rm(fixtureRoot, { recursive: true, force: true });
		}
	});

	it('reads video duration', async (ctx) => {
		if (!ffmpegReady) ctx.skip();
		const durationMs = await getVideoDurationMs(silentVideo);
		expect(durationMs).toBeGreaterThanOrEqual(2_900);
		expect(durationMs).toBeLessThanOrEqual(3_200);
	});

	it('detects scene boundaries', async (ctx) => {
		if (!ffmpegReady) ctx.skip();
		const scenes = await detectScenes(silentVideo, {
			outputDir: join(fixtureRoot, 'scenes-only'),
			sceneThreshold: 0.2
		});

		expect(scenes.length).toBeGreaterThanOrEqual(1);
		expect(scenes[0]?.startMs).toBe(0);
		expect(scenes.at(-1)?.endMs).toBeGreaterThanOrEqual(2_900);
		for (let i = 1; i < scenes.length; i++) {
			expect(scenes[i]!.startMs).toBe(scenes[i - 1]!.endMs);
		}
	});

	it('extracts keyframe JPEGs on disk', async (ctx) => {
		if (!ffmpegReady) ctx.skip();
		const outDir = join(fixtureRoot, 'keyframes');
		const frames = await extractKeyframes(silentVideo, { outputDir: outDir, maxKeyframes: 8 });

		expect(frames.length).toBeGreaterThan(0);
		expect(frames[0]?.atMs).toBe(0);
		for (const frame of frames) {
			expect(await fileExists(frame.fileRef)).toBe(true);
		}
	});

	it('returns null audio for silent footage', async (ctx) => {
		if (!ffmpegReady) ctx.skip();
		const audio = await extractAudio(silentVideo, { outputDir: join(fixtureRoot, 'silent-audio') });
		expect(audio).toBeNull();
	});

	it('extracts audio when a track is present', async (ctx) => {
		if (!ffmpegReady) ctx.skip();
		const audio = await extractAudio(audioVideo, { outputDir: join(fixtureRoot, 'audio') });
		expect(audio).not.toBeNull();
		expect(await fileExists(audio!.fileRef)).toBe(true);
		expect(audio!.durationMs).toBeGreaterThan(1_500);
	});

	it('splits the video into clip files', async (ctx) => {
		if (!ffmpegReady) ctx.skip();
		const clips = await splitIntoClips(silentVideo, {
			outputDir: join(fixtureRoot, 'clips'),
			sceneThreshold: 0.2
		});

		expect(clips.length).toBeGreaterThanOrEqual(1);
		for (const clip of clips) {
			expect(clip.endMs).toBeGreaterThan(clip.startMs);
			expect(await fileExists(clip.fileRef)).toBe(true);
		}
	});
});
