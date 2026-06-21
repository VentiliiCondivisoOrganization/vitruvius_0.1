import {
	manualStepSchema,
	newLearningSchema,
	partRefFromLabel,
	type ManualStep
} from '@vitruvius/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { distillLearnings } from './index.js';
import {
	HeuristicLearningsProvider,
	resetLearningsProviderFactory,
	setLearningsProviderFactory
} from './providers/learnings-provider.js';
import type { LearningsProvider } from './providers/learnings-types.js';

const MANUAL_ID = '99999999-9999-9999-9999-999999999999';

function makeStep(overrides: Partial<ManualStep> = {}): ManualStep {
	return manualStepSchema.parse({
		id: '11111111-1111-1111-1111-111111111111',
		order: 0,
		title: 'Attach leg A',
		instruction: 'Screw leg A into the corner socket until it clicks.',
		startMs: 0,
		endMs: 3000,
		keyframeUrl: 'file:///tmp/frame_0001.jpg',
		tools: ['screwdriver'],
		parts: [partRefFromLabel('leg A')],
		warnings: ['Do not overtighten — the thread strips easily.'],
		confidence: 0.8,
		reviewStatus: 'hypothesis',
		sourceNotes: ['narrator says "attach leg A" at 1200ms'],
		alternatives: [],
		...overrides
	});
}

describe('distillLearnings', () => {
	beforeEach(() => {
		setLearningsProviderFactory(() => new HeuristicLearningsProvider());
	});

	afterEach(() => {
		resetLearningsProviderFactory();
	});

	it('keeps generalizable facts and drops per-video noise', async () => {
		setLearningsProviderFactory(
			(): LearningsProvider => ({
				name: 'stub',
				distill: () =>
					Promise.resolve([
						{ scope: 'assembly', text: 'Pre-thread bolts by hand before using a driver.' },
						{ scope: 'audio-cue', text: 'A click means a clip has fully seated.' },
						// Per-video noise — must be rejected.
						{ scope: 'transcript', text: 'Narrator says "attach leg A" at 1200ms.' },
						{ scope: 'transcript', text: 'Cut at 0:42 to the next angle.' }
					])
			})
		);

		const learnings = await distillLearnings({ manualId: MANUAL_ID, steps: [makeStep()] });
		const texts = learnings.map((l) => l.text);

		expect(texts).toContain('Pre-thread bolts by hand before using a driver.');
		expect(texts).toContain('A click means a clip has fully seated.');
		expect(texts.some((t) => /1200ms|0:42/.test(t))).toBe(false);
		for (const l of learnings) {
			expect(() => newLearningSchema.parse(l)).not.toThrow();
			expect(l.sourceManualId).toBe(MANUAL_ID);
		}
	});

	it('does not repeat already-known learnings', async () => {
		setLearningsProviderFactory(
			(): LearningsProvider => ({
				name: 'stub',
				distill: () =>
					Promise.resolve([
						{ scope: 'assembly', text: 'Pre-thread bolts by hand before using a driver.' },
						{ scope: 'assembly', text: 'A brand new generalizable tip about cam locks.' }
					])
			})
		);

		const learnings = await distillLearnings({
			manualId: MANUAL_ID,
			steps: [makeStep()],
			existingLearnings: ['Pre-thread bolts by hand before using a driver.']
		});

		expect(learnings).toHaveLength(1);
		expect(learnings[0]?.text).toBe('A brand new generalizable tip about cam locks.');
	});

	it('heuristic provider distills recurring warnings, not transcript notes', async () => {
		const learnings = await distillLearnings({ manualId: MANUAL_ID, steps: [makeStep()] });

		expect(learnings).toHaveLength(1);
		expect(learnings[0]?.scope).toBe('warning');
		expect(learnings[0]?.text).toBe('Do not overtighten — the thread strips easily.');
	});

	it('returns [] for an empty run', async () => {
		const learnings = await distillLearnings({ manualId: MANUAL_ID, steps: [] });
		expect(learnings).toEqual([]);
	});
});
