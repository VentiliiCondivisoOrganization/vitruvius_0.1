import { manualStepSchema, partRefFromLabel, type ManualStep } from '@vitruvius/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearCritiqueCache, critiqueSteps } from './index.js';
import {
	HeuristicCritiqueProvider,
	resetCritiqueProviderFactory,
	setCritiqueProviderFactory
} from './providers/critique-provider.js';
import type { CritiqueProvider } from './providers/critique-types.js';

function makeStep(overrides: Partial<ManualStep> = {}): ManualStep {
	return manualStepSchema.parse({
		id: '11111111-1111-1111-1111-111111111111',
		order: 0,
		title: 'Attach leg A',
		instruction: 'Screw leg A into the corner socket.',
		startMs: 0,
		endMs: 3000,
		keyframeUrl: 'file:///tmp/frame_0001.jpg',
		tools: ['screwdriver'],
		parts: [partRefFromLabel('leg A')],
		warnings: [],
		confidence: 0.8,
		reviewStatus: 'hypothesis',
		sourceNotes: ['narrator says "attach leg A" at 1200ms'],
		alternatives: [],
		...overrides
	});
}

describe('critiqueSteps', () => {
	beforeEach(() => {
		clearCritiqueCache();
		setCritiqueProviderFactory(() => new HeuristicCritiqueProvider());
	});

	afterEach(() => {
		resetCritiqueProviderFactory();
		clearCritiqueCache();
	});

	it('leaves a well-supported step unflagged with confidence intact', async () => {
		const input = makeStep();
		const [step] = await critiqueSteps({ steps: [input] });

		expect(() => manualStepSchema.parse(step)).not.toThrow();
		expect(step?.critique).toEqual([]);
		expect(step?.confidence).toBe(input.confidence);
	});

	it('flags an unsupported step and lowers its confidence', async () => {
		const input = makeStep({ sourceNotes: [], confidence: 0.8 });
		const [step] = await critiqueSteps({ steps: [input] });

		expect(step?.critique.length).toBeGreaterThan(0);
		expect(step?.confidence).toBeLessThan(input.confidence);
	});

	it('never mutates instruction, title, tools, or parts', async () => {
		setCritiqueProviderFactory(
			(): CritiqueProvider => ({
				name: 'stub',
				critiqueSteps: (steps) =>
					Promise.resolve(
						steps.map((s) => ({
							order: s.order,
							confidence: 0.1,
							critique: ['warning not justified by any source note']
						}))
					)
			})
		);

		const input = makeStep();
		const [step] = await critiqueSteps({ steps: [input] });
		expect(step?.instruction).toBe(input.instruction);
		expect(step?.title).toBe(input.title);
		expect(step?.tools).toEqual(input.tools);
		expect(step?.parts).toEqual(input.parts);
		expect(step?.critique).toEqual(['warning not justified by any source note']);
	});

	it('never raises confidence above the generator estimate', async () => {
		setCritiqueProviderFactory(
			(): CritiqueProvider => ({
				name: 'optimistic',
				critiqueSteps: (steps) =>
					Promise.resolve(steps.map((s) => ({ order: s.order, confidence: 0.99, critique: [] })))
			})
		);

		const input = makeStep({ confidence: 0.5 });
		const [step] = await critiqueSteps({ steps: [input] });
		expect(step?.confidence).toBe(0.5);
	});

	it('uses cache on identical input (provider called once)', async () => {
		let calls = 0;
		setCritiqueProviderFactory(
			(): CritiqueProvider => ({
				name: 'counting',
				critiqueSteps: (steps) => {
					calls += 1;
					return Promise.resolve(
						steps.map((s) => ({ order: s.order, confidence: s.confidence, critique: [] }))
					);
				}
			})
		);

		const steps = [makeStep()];
		await critiqueSteps({ steps });
		await critiqueSteps({ steps });
		expect(calls).toBe(1);
	});

	it('passes through steps the provider does not return', async () => {
		setCritiqueProviderFactory(
			(): CritiqueProvider => ({
				name: 'partial',
				critiqueSteps: (steps) =>
					Promise.resolve(
						steps
							.filter((s) => s.order === 0)
							.map((s) => ({ order: s.order, confidence: 0.1, critique: ['flagged'] }))
					)
			})
		);

		const steps = [
			makeStep(),
			makeStep({ id: '22222222-2222-2222-2222-222222222222', order: 1, confidence: 0.7 })
		];
		const result = await critiqueSteps({ steps });
		expect(result[0]?.critique).toEqual(['flagged']);
		expect(result[1]?.critique).toEqual([]); // untouched original
		expect(result[1]?.confidence).toBe(0.7);
	});

	it('returns [] for empty input without calling the provider', async () => {
		let calls = 0;
		setCritiqueProviderFactory(
			(): CritiqueProvider => ({
				name: 'never',
				critiqueSteps: () => {
					calls += 1;
					return Promise.resolve([]);
				}
			})
		);

		const result = await critiqueSteps({ steps: [] });
		expect(result).toEqual([]);
		expect(calls).toBe(0);
	});
});
