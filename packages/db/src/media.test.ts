import { instructionManualSchema, type InstructionManual, type ManualStep } from '@vitruvius/core';
import { describe, expect, it, vi } from 'vitest';
import type { DbClient } from './client.js';
import { signManualMedia, signManualMediaUrls } from './media.js';

function step(overrides: Partial<ManualStep> = {}): ManualStep {
	return {
		id: crypto.randomUUID(),
		order: 0,
		title: 'Step',
		instruction: '',
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
	};
}

function manual(steps: ManualStep[]): InstructionManual {
	return instructionManualSchema.parse({
		id: 'manual-1',
		title: 'Test',
		videoUrl: 'manual-1/source.mp4',
		status: 'ready',
		steps,
		createdAt: '2026-06-24T00:00:00.000Z',
		updatedAt: '2026-06-24T00:00:00.000Z'
	});
}

/** A db whose batch signer turns each key into a deterministic fake signed URL. */
function signingDb(): { db: DbClient; createSignedUrls: ReturnType<typeof vi.fn> } {
	const createSignedUrls = vi.fn(async (paths: string[]) => ({
		data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}`, error: null })),
		error: null
	}));
	const db = { storage: { from: () => ({ createSignedUrls }) } } as unknown as DbClient;
	return { db, createSignedUrls };
}

describe('signManualMediaUrls', () => {
	it('signs only media keys, skipping empties, legacy paths, and http URLs', async () => {
		const { db, createSignedUrls } = signingDb();
		const m = manual([
			step({
				keyframeUrl: 'manual-1/keyframes/1.jpg',
				illustrationUrl: 'manual-1/illustrations/1.png'
			}),
			step({ keyframeUrl: '', illustrationUrl: '' }),
			step({ keyframeUrl: '/tmp/legacy.jpg', illustrationUrl: 'https://cdn/x.png' })
		]);

		const map = await signManualMediaUrls(db, m);

		// Only the two real media keys were sent for signing.
		expect(createSignedUrls).toHaveBeenCalledTimes(1);
		expect(createSignedUrls.mock.calls[0]?.[0].sort()).toEqual([
			'manual-1/illustrations/1.png',
			'manual-1/keyframes/1.jpg'
		]);
		expect(map.get('manual-1/keyframes/1.jpg')).toBe('https://signed/manual-1/keyframes/1.jpg');
		expect(map.has('/tmp/legacy.jpg')).toBe(false);
		expect(map.has('https://cdn/x.png')).toBe(false);
	});

	it('returns an empty map (no network) when there are no media keys', async () => {
		const { db, createSignedUrls } = signingDb();
		const map = await signManualMediaUrls(db, manual([step({ keyframeUrl: '/tmp/x.jpg' })]));
		expect(map.size).toBe(0);
		expect(createSignedUrls).not.toHaveBeenCalled();
	});
});

describe('signManualMedia', () => {
	it('rewrites step media keys to signed URLs, leaving non-keys untouched', async () => {
		const { db } = signingDb();
		const m = manual([
			step({ keyframeUrl: 'manual-1/keyframes/1.jpg', illustrationUrl: '' }),
			step({ keyframeUrl: '/tmp/legacy.jpg', illustrationUrl: 'manual-1/illustrations/2.png' })
		]);

		const resolved = await signManualMedia(db, m);

		expect(resolved.steps[0]?.keyframeUrl).toBe('https://signed/manual-1/keyframes/1.jpg');
		expect(resolved.steps[0]?.illustrationUrl).toBe('');
		// Legacy absolute path is passed through; the illustration key is signed.
		expect(resolved.steps[1]?.keyframeUrl).toBe('/tmp/legacy.jpg');
		expect(resolved.steps[1]?.illustrationUrl).toBe('https://signed/manual-1/illustrations/2.png');
		// Original manual is not mutated.
		expect(m.steps[0]?.keyframeUrl).toBe('manual-1/keyframes/1.jpg');
	});

	it('returns the manual unchanged when there is nothing to sign', async () => {
		const { db } = signingDb();
		const m = manual([step()]);
		const resolved = await signManualMedia(db, m);
		expect(resolved).toBe(m);
	});
});
