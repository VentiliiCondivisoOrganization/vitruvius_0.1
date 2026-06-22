import { manualStepSchema, type DigitalModel, type ManualStep } from '@vitruvius/core';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearIllustrateCache, illustrateSteps } from './index.js';
import {
	HeuristicIllustrateProvider,
	resetIllustrateProviderFactory,
	setIllustrateProviderFactory
} from './providers/illustrate-provider.js';
import type { IllustrateProvider, IllustrationRequest } from './providers/illustrate-types.js';

const PNG_BASE64 = Buffer.from('fake-png-bytes').toString('base64');

function makeStep(overrides: Partial<ManualStep> = {}): ManualStep {
	return manualStepSchema.parse({
		id: overrides.id ?? '11111111-1111-1111-1111-111111111111',
		order: 0,
		title: 'Attach leg A',
		instruction: 'Screw leg A into the corner socket.',
		startMs: 0,
		endMs: 3000,
		keyframeUrl: 'file:///tmp/frame_0001.jpg',
		tools: ['screwdriver'],
		parts: [],
		warnings: [],
		confidence: 0.7,
		reviewStatus: 'hypothesis',
		sourceNotes: ['narrator says "attach leg A" at 1200ms'],
		alternatives: [],
		...overrides
	});
}

const baseSteps: ManualStep[] = [
	makeStep(),
	makeStep({
		id: '22222222-2222-2222-2222-222222222222',
		order: 1,
		title: 'Attach leg B',
		startMs: 3000,
		endMs: 6000,
		keyframeUrl: 'file:///tmp/frame_0002.jpg'
	})
];

/** Provider that returns a canned image for every request and counts batch calls. */
function stubProvider(calls: { n: number }): IllustrateProvider {
	return {
		name: 'stub',
		illustrate: (requests) => {
			calls.n += 1;
			return Promise.resolve(
				requests.map((r) => ({
					order: r.step.order,
					imageBase64: PNG_BASE64,
					mimeType: 'image/png'
				}))
			);
		}
	};
}

let outDir: string;

beforeEach(async () => {
	clearIllustrateCache();
	outDir = await mkdtemp(join(tmpdir(), 'vitruvius-illustrate-test-'));
});

afterEach(async () => {
	resetIllustrateProviderFactory();
	clearIllustrateCache();
	await rm(outDir, { recursive: true, force: true });
});

describe('illustrateSteps', () => {
	it('gives every step a schema-valid illustrationUrl file ref', async () => {
		setIllustrateProviderFactory(() => stubProvider({ n: 0 }));

		const steps = await illustrateSteps({ steps: baseSteps, outDir });

		expect(steps).toHaveLength(baseSteps.length);
		for (const step of steps) {
			expect(() => manualStepSchema.parse(step)).not.toThrow();
			expect(step.illustrationUrl.length).toBeGreaterThan(0);
			const bytes = await readFile(step.illustrationUrl);
			expect(bytes.length).toBeGreaterThan(0);
		}
	});

	it('preserves keyframeUrl as source evidence after illustration', async () => {
		setIllustrateProviderFactory(() => stubProvider({ n: 0 }));

		const steps = await illustrateSteps({ steps: baseSteps, outDir });

		steps.forEach((step, i) => {
			expect(step.keyframeUrl).toBe(baseSteps[i]!.keyframeUrl);
			expect(step.illustrationUrl).not.toBe(step.keyframeUrl);
		});
	});

	it('caches per step — identical input does not re-bill the provider', async () => {
		const calls = { n: 0 };
		setIllustrateProviderFactory(() => stubProvider(calls));

		await illustrateSteps({ steps: baseSteps, outDir });
		await illustrateSteps({ steps: baseSteps, outDir });

		expect(calls.n).toBe(1);
	});

	it('passes through steps the provider declines', async () => {
		setIllustrateProviderFactory(
			(): IllustrateProvider => ({
				name: 'partial',
				illustrate: (requests) =>
					Promise.resolve(
						requests
							.filter((r) => r.step.order === 0)
							.map((r) => ({ order: r.step.order, imageBase64: PNG_BASE64, mimeType: 'image/png' }))
					)
			})
		);

		const steps = await illustrateSteps({ steps: baseSteps, outDir });
		expect(steps[0]?.illustrationUrl.length).toBeGreaterThan(0);
		expect(steps[1]?.illustrationUrl).toBe(''); // untouched original
	});

	it('returns [] for empty input without calling the provider', async () => {
		const calls = { n: 0 };
		setIllustrateProviderFactory(() => stubProvider(calls));

		const steps = await illustrateSteps({ steps: [], outDir });
		expect(steps).toEqual([]);
		expect(calls.n).toBe(0);
	});

	it('uses Compositor-lite on canonical views when the model is primed', async () => {
		const seen: IllustrationRequest[] = [];
		setIllustrateProviderFactory(
			(): IllustrateProvider => ({
				name: 'recording',
				illustrate: (requests) => {
					seen.push(...requests);
					return Promise.resolve(
						requests.map((r) => ({
							order: r.step.order,
							imageBase64: PNG_BASE64,
							mimeType: 'image/png'
						}))
					);
				}
			})
		);

		const digitalModel: DigitalModel = {
			status: 'primed',
			source: null,
			bom: [],
			assembly: [],
			geometry: null,
			views: [{ target: 'assembly', angle: 'iso', fileRef: '/tmp/views/assembly_iso.png' }],
			contentHash: 'abc'
		};

		await illustrateSteps({ steps: baseSteps, outDir, digitalModel });

		expect(seen.length).toBe(baseSteps.length);
		for (const req of seen) {
			expect(req.mode).toBe('compositor-lite');
			expect(req.baseImageRef).toBe('/tmp/views/assembly_iso.png');
		}
	});

	it('heuristic fallback reuses the keyframe image as a placeholder illustration', async () => {
		const keyframePath = join(outDir, 'frame.png');
		const keyframeBytes = Buffer.from('keyframe-pixels');
		await writeFile(keyframePath, keyframeBytes);

		setIllustrateProviderFactory(() => new HeuristicIllustrateProvider());

		const steps = await illustrateSteps({
			steps: [makeStep({ keyframeUrl: keyframePath })],
			outDir
		});

		const illustrationUrl = steps[0]!.illustrationUrl;
		expect(illustrationUrl.length).toBeGreaterThan(0);
		expect(illustrationUrl).not.toBe(keyframePath);
		const written = await readFile(illustrationUrl);
		expect(written.equals(keyframeBytes)).toBe(true);
	});

	it('threads regeneration guidance into requests and busts the cache (spec 16)', async () => {
		const seen: (string | undefined)[] = [];
		let calls = 0;
		setIllustrateProviderFactory(
			(): IllustrateProvider => ({
				name: 'guidance-recording',
				illustrate: (requests) => {
					calls += 1;
					for (const r of requests) seen.push(r.guidance);
					return Promise.resolve(
						requests.map((r) => ({
							order: r.step.order,
							imageBase64: PNG_BASE64,
							mimeType: 'image/png'
						}))
					);
				}
			})
		);

		await illustrateSteps({ steps: baseSteps, outDir, guidance: 'make the arrow clearer' });
		await illustrateSteps({ steps: baseSteps, outDir, guidance: 'make the arrow clearer' }); // cached
		await illustrateSteps({ steps: baseSteps, outDir, guidance: 'use a top-down view' }); // new

		expect(calls).toBe(2);
		expect(seen).toContain('make the arrow clearer');
		expect(seen).toContain('use a top-down view');
	});
});
