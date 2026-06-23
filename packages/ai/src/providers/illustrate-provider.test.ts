import { manualStepSchema, type ManualStep } from '@vitruvius/core';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GeminiIllustrateProvider } from './illustrate-provider.js';
import type { IllustrationRequest } from './illustrate-types.js';

const IMAGE_BASE64 = Buffer.from('generated-schematic').toString('base64');

function makeRequest(baseImageRef: string): IllustrationRequest {
	const step: ManualStep = manualStepSchema.parse({
		id: '11111111-1111-1111-1111-111111111111',
		order: 0,
		title: 'Attach leg A',
		instruction: 'Screw leg A into the corner socket.',
		startMs: 0,
		endMs: 3000,
		keyframeUrl: baseImageRef,
		tools: [],
		parts: [],
		warnings: [],
		confidence: 0.7,
		reviewStatus: 'hypothesis',
		sourceNotes: [],
		alternatives: []
	});
	return { step, mode: 'illustrator', baseImageRef };
}

describe('GeminiIllustrateProvider', () => {
	let dir: string;
	let baseImageRef: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'vitruvius-illustrate-provider-'));
		baseImageRef = join(dir, 'keyframe.png');
		await writeFile(baseImageRef, Buffer.from('keyframe-pixels'));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it('returns the inline image bytes from a Gemini image response', async () => {
		const mockFetch: typeof fetch = async () =>
			({
				ok: true,
				status: 200,
				statusText: 'OK',
				json: async () => ({
					candidates: [
						{
							content: {
								parts: [
									{ text: 'Here is the schematic.' },
									{ inlineData: { mimeType: 'image/png', data: IMAGE_BASE64 } }
								]
							}
						}
					]
				})
			}) as Response;

		const provider = new GeminiIllustrateProvider({ apiKey: 'test-key', fetchFn: mockFetch });
		const out = await provider.illustrate([makeRequest(baseImageRef)], {
			styleVersion: 'illustrate-style-v1'
		});

		expect(out).toHaveLength(1);
		expect(out[0]?.order).toBe(0);
		expect(out[0]?.imageBase64).toBe(IMAGE_BASE64);
		expect(out[0]?.mimeType).toBe('image/png');
	});

	it('declines a step when the response carries no image part', async () => {
		const mockFetch: typeof fetch = async () =>
			({
				ok: true,
				status: 200,
				statusText: 'OK',
				json: async () => ({ candidates: [{ content: { parts: [{ text: 'no image' }] } }] })
			}) as Response;

		const provider = new GeminiIllustrateProvider({ apiKey: 'test-key', fetchFn: mockFetch });
		const out = await provider.illustrate([makeRequest(baseImageRef)], {
			styleVersion: 'illustrate-style-v1'
		});

		expect(out).toHaveLength(0);
	});

	it('throws with the API error message on a non-ok response', async () => {
		const mockFetch: typeof fetch = async () =>
			({
				ok: false,
				status: 429,
				statusText: 'Too Many Requests',
				json: async () => ({ error: { message: 'quota exceeded' } })
			}) as Response;

		const provider = new GeminiIllustrateProvider({ apiKey: 'test-key', fetchFn: mockFetch });
		await expect(
			provider.illustrate([makeRequest(baseImageRef)], { styleVersion: 'illustrate-style-v1' })
		).rejects.toThrow('quota exceeded');
	});
});
