import { manualStepSchema, type ManualStep } from '@vitruvius/core';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Capture uploads; manualMediaKey uses the real scoping so we assert the exact key shape.
const uploads = vi.hoisted(() => [] as { key: string; contentType: string; bytes: number }[]);

vi.mock('@vitruvius/db', () => ({
	manualMediaKey: (manualId: string, kind: string, file: string) => `${manualId}/${kind}/${file}`,
	uploadManualMedia: async (_db: unknown, key: string, body: Buffer, contentType: string) => {
		uploads.push({ key, contentType, bytes: body.byteLength });
	}
}));

const { publishStepMedia } = await import('./publish-media.js');

const DB = {} as never;

function step(overrides: Partial<ManualStep> = {}): ManualStep {
	return manualStepSchema.parse({
		id: randomUUID(),
		order: 0,
		title: 'Step',
		instruction: 'Do.',
		startMs: 0,
		endMs: 1000,
		keyframeUrl: '',
		tools: [],
		parts: [],
		warnings: [],
		confidence: 0.5,
		reviewStatus: 'hypothesis',
		sourceNotes: [],
		alternatives: [],
		critique: [],
		caption: '',
		illustrationUrl: '',
		...overrides
	});
}

let dir: string;

beforeEach(async () => {
	uploads.length = 0;
	dir = await mkdtemp(join(tmpdir(), 'publish-media-test-'));
});

afterEach(async () => {
	uploads.length = 0;
	await rm(dir, { recursive: true, force: true });
});

describe('publishStepMedia', () => {
	it('uploads absolute local refs and rewrites them to manual-scoped keys', async () => {
		const kf = join(dir, 'keyframe-00001.jpg');
		const ill = join(dir, 'illustration_0.png');
		await writeFile(kf, Buffer.from('jpegbytes'));
		await writeFile(ill, Buffer.from('pngbytes'));

		const [out] = await publishStepMedia(DB, 'manual-1', [
			step({ keyframeUrl: kf, illustrationUrl: ill })
		]);

		expect(out?.keyframeUrl).toBe('manual-1/keyframes/keyframe-00001.jpg');
		expect(out?.illustrationUrl).toBe('manual-1/illustrations/illustration_0.png');
		expect(uploads).toEqual(
			expect.arrayContaining([
				{ key: 'manual-1/keyframes/keyframe-00001.jpg', contentType: 'image/jpeg', bytes: 9 },
				{ key: 'manual-1/illustrations/illustration_0.png', contentType: 'image/png', bytes: 8 }
			])
		);
	});

	it('leaves empty refs and already-published keys untouched (idempotent re-run)', async () => {
		const [out] = await publishStepMedia(DB, 'manual-1', [
			step({ keyframeUrl: 'manual-1/keyframes/keyframe-00001.jpg', illustrationUrl: '' })
		]);

		expect(out?.keyframeUrl).toBe('manual-1/keyframes/keyframe-00001.jpg');
		expect(out?.illustrationUrl).toBe('');
		expect(uploads).toHaveLength(0);
	});

	it('preserves step order and only rewrites the media fields', async () => {
		const kf = join(dir, 'frame.jpg');
		await writeFile(kf, Buffer.from('x'));

		const steps = [
			step({ order: 0, title: 'First', keyframeUrl: kf }),
			step({ order: 1, title: 'Second', keyframeUrl: '' })
		];
		const out = await publishStepMedia(DB, 'm', steps);

		expect(out.map((s) => s.title)).toEqual(['First', 'Second']);
		expect(out[0]?.keyframeUrl).toBe('m/keyframes/frame.jpg');
		expect(out[1]?.keyframeUrl).toBe('');
	});
});
