import { manualStepSchema, type ManualStep } from '@vitruvius/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearInstructCache, writeInstructions } from './index.js';
import {
	HeuristicInstructProvider,
	resetInstructProviderFactory,
	setInstructProviderFactory
} from './providers/instruct-provider.js';
import type { InstructProvider } from './providers/instruct-types.js';

function makeStep(overrides: Partial<ManualStep> = {}): ManualStep {
	return manualStepSchema.parse({
		id: overrides.id ?? '11111111-1111-1111-1111-111111111111',
		order: 0,
		title: 'Step 1',
		instruction: '',
		startMs: 0,
		endMs: 3000,
		keyframeUrl: 'file:///tmp/frame_0001.jpg',
		tools: [],
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
		title: 'Step 2',
		startMs: 3000,
		endMs: 6000,
		keyframeUrl: 'file:///tmp/frame_0002.jpg',
		confidence: 0.4,
		sourceNotes: ['scene cut at 3000ms; screwdriver visible']
	})
];

describe('writeInstructions', () => {
	beforeEach(() => {
		clearInstructCache();
		setInstructProviderFactory(() => new HeuristicInstructProvider());
	});

	afterEach(() => {
		resetInstructProviderFactory();
		clearInstructCache();
	});

	it('returns schema-valid enriched steps', async () => {
		const steps = await writeInstructions({ steps: baseSteps });

		expect(steps).toHaveLength(baseSteps.length);
		for (const step of steps) {
			expect(() => manualStepSchema.parse(step)).not.toThrow();
			expect(step.instruction.length).toBeGreaterThan(0);
			expect(step.reviewStatus).toBe('hypothesis');
		}
	});

	it('preserves segmentation facts (time, confidence, id, order)', async () => {
		const steps = await writeInstructions({ steps: baseSteps });

		steps.forEach((step, i) => {
			const src = baseSteps[i]!;
			expect(step.id).toBe(src.id);
			expect(step.order).toBe(src.order);
			expect(step.startMs).toBe(src.startMs);
			expect(step.endMs).toBe(src.endMs);
			expect(step.confidence).toBe(src.confidence);
		});
	});

	it('keeps every original source note (notes are a superset)', async () => {
		const steps = await writeInstructions({ steps: baseSteps });

		steps.forEach((step, i) => {
			for (const note of baseSteps[i]!.sourceNotes) {
				expect(step.sourceNotes).toContain(note);
			}
		});
	});

	it('merges added visual-evidence notes so populated fields stay traceable', async () => {
		setInstructProviderFactory(
			(): InstructProvider => ({
				name: 'stub',
				writeInstructions: (steps) =>
					Promise.resolve(
						steps.map((s) => ({
							order: s.order,
							title: 'Attach leg A',
							instruction: 'Screw leg A into the corner socket.',
							tools: ['screwdriver'],
							parts: ['leg A'],
							warnings: [],
							alternatives: [],
							addedSourceNotes: ['screwdriver visible in keyframe']
						}))
					)
			})
		);

		const steps = await writeInstructions({ steps: baseSteps });
		for (const step of steps) {
			expect(step.tools).toContain('screwdriver');
			expect(step.sourceNotes).toContain('screwdriver visible in keyframe');
			// Populated operative fields with a non-empty source-note trail.
			expect(step.sourceNotes.length).toBeGreaterThan(0);
		}
	});

	it('uses cache on identical input (provider called once)', async () => {
		let calls = 0;
		setInstructProviderFactory(
			(): InstructProvider => ({
				name: 'counting',
				writeInstructions: (steps) => {
					calls += 1;
					return Promise.resolve(
						steps.map((s) => ({
							order: s.order,
							title: s.title,
							instruction: 'do the thing',
							tools: [],
							parts: [],
							warnings: [],
							alternatives: []
						}))
					);
				}
			})
		);

		await writeInstructions({ steps: baseSteps });
		await writeInstructions({ steps: baseSteps });
		expect(calls).toBe(1);
	});

	it('passes through steps the provider does not return', async () => {
		setInstructProviderFactory(
			(): InstructProvider => ({
				name: 'partial',
				writeInstructions: (steps) =>
					Promise.resolve(
						steps
							.filter((s) => s.order === 0)
							.map((s) => ({
								order: s.order,
								title: 'Enriched',
								instruction: 'enriched instruction',
								tools: [],
								parts: [],
								warnings: [],
								alternatives: []
							}))
					)
			})
		);

		const steps = await writeInstructions({ steps: baseSteps });
		expect(steps[0]?.instruction).toBe('enriched instruction');
		expect(steps[1]?.instruction).toBe(''); // untouched original
	});

	it('returns [] for empty input without calling the provider', async () => {
		let calls = 0;
		setInstructProviderFactory(
			(): InstructProvider => ({
				name: 'never',
				writeInstructions: () => {
					calls += 1;
					return Promise.resolve([]);
				}
			})
		);

		const steps = await writeInstructions({ steps: [] });
		expect(steps).toEqual([]);
		expect(calls).toBe(0);
	});
});
