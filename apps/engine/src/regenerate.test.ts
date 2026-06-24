import {
	clearInstructCache,
	HeuristicInstructProvider,
	resetInstructProviderFactory,
	setInstructProviderFactory
} from '@vitruvius/ai';
import {
	instructionManualSchema,
	manualStepSchema,
	type InstructionManual,
	type Job,
	type ManualStep,
	type RegenerateRequest
} from '@vitruvius/core';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The mocked `@vitruvius/db` reads/writes this holder. `vi.hoisted` runs it before the
// hoisted `vi.mock` factory, so the mock can close over it.
const dbState = vi.hoisted(() => ({
	manual: null as InstructionManual | null,
	saved: [] as InstructionManual[]
}));

vi.mock('@vitruvius/db', () => ({
	getManual: async () => dbState.manual,
	relevantLearnings: async () => [],
	saveManual: async (_db: unknown, manual: InstructionManual) => {
		dbState.saved.push(manual);
	}
}));

// Imported after `vi.mock` so the handler binds to the mocked db queries.
const { handleRegenerateJob } = await import('./regenerate.js');

// The db argument is ignored by the mocked queries.
const DB = {} as never;

function step(overrides: Partial<ManualStep> = {}): ManualStep {
	return manualStepSchema.parse({
		id: overrides.id ?? randomUUID(),
		order: 0,
		title: 'Step',
		instruction: 'Do the thing.',
		startMs: 0,
		endMs: 4000,
		keyframeUrl: 'file:///tmp/frame.jpg',
		tools: [],
		parts: [],
		warnings: [],
		confidence: 0.6,
		reviewStatus: 'confirmed',
		sourceNotes: ['narrator attaches the panel'],
		alternatives: [],
		...overrides
	});
}

function manual(steps: ManualStep[]): InstructionManual {
	return instructionManualSchema.parse({
		id: 'manual-1',
		title: 'Test manual',
		videoUrl: 'file:///tmp/v.mp4',
		status: 'ready',
		steps,
		createdAt: '2026-06-24T00:00:00.000Z',
		updatedAt: '2026-06-24T00:00:00.000Z'
	});
}

function structureJob(request: RegenerateRequest): Job {
	return {
		id: 'job-1',
		manualId: 'manual-1',
		type: 'regenerate',
		status: 'running',
		attempts: 1,
		payload: request,
		createdAt: '2026-06-24T00:00:00.000Z',
		updatedAt: '2026-06-24T00:00:00.000Z'
	};
}

beforeEach(() => {
	dbState.manual = null;
	dbState.saved.length = 0;
	// Pin the offline Heuristic Instructor so re-instruction is deterministic and needs no key.
	setInstructProviderFactory(() => new HeuristicInstructProvider());
	clearInstructCache();
});

afterEach(() => {
	resetInstructProviderFactory();
	clearInstructCache();
});

describe('regenerate structure scope', () => {
	it('splits a single targeted step at its midpoint and renumbers the timeline', async () => {
		const a = step({ id: 'a', order: 0, startMs: 0, endMs: 4000 });
		const b = step({ id: 'b', order: 1, startMs: 4000, endMs: 8000 });
		dbState.manual = manual([a, b]);

		await handleRegenerateJob(
			DB,
			structureJob({ scope: 'structure', prompt: 'split the first step', stepIds: ['a'] })
		);

		expect(dbState.saved).toHaveLength(1);
		const saved = dbState.saved.at(0);
		expect(saved).toBeDefined();
		if (!saved) return;
		expect(saved.steps).toHaveLength(3);
		expect(saved.steps.map((s) => s.order)).toEqual([0, 1, 2]);
		// First half keeps the original id and the [0, mid] window; the new half gets a fresh id.
		// Both halves are demoted for re-confirmation; the untouched step is preserved.
		expect(saved.steps[0]).toMatchObject({
			id: 'a',
			startMs: 0,
			endMs: 2000,
			reviewStatus: 'edited'
		});
		expect(saved.steps[1]).toMatchObject({ startMs: 2000, endMs: 4000, reviewStatus: 'edited' });
		expect(saved.steps[1]?.id).not.toBe('a');
		expect(saved.steps[2]).toMatchObject({ id: 'b', reviewStatus: 'confirmed' });
	});

	it('merges contiguous targeted steps into one, spanning their window with the lowest confidence', async () => {
		const a = step({ id: 'a', order: 0, startMs: 0, endMs: 4000, confidence: 0.8 });
		const b = step({ id: 'b', order: 1, startMs: 4000, endMs: 8000, confidence: 0.3 });
		const c = step({ id: 'c', order: 2, startMs: 8000, endMs: 9000 });
		dbState.manual = manual([a, b, c]);

		await handleRegenerateJob(
			DB,
			structureJob({ scope: 'structure', prompt: 'merge the first two', stepIds: ['a', 'b'] })
		);

		const saved = dbState.saved.at(0);
		expect(saved).toBeDefined();
		if (!saved) return;
		expect(saved.steps).toHaveLength(2);
		expect(saved.steps.map((s) => s.order)).toEqual([0, 1]);
		// The first step anchors the merge: its id, the widest window, the lowest confidence.
		expect(saved.steps[0]).toMatchObject({
			id: 'a',
			startMs: 0,
			endMs: 8000,
			confidence: 0.3,
			reviewStatus: 'edited'
		});
		// The untouched trailing step is preserved unchanged.
		expect(saved.steps[1]).toMatchObject({ id: 'c', reviewStatus: 'confirmed' });
	});

	it('rejects a merge of non-contiguous steps', async () => {
		const a = step({ id: 'a', order: 0, startMs: 0, endMs: 4000 });
		const b = step({ id: 'b', order: 1, startMs: 4000, endMs: 8000 });
		const c = step({ id: 'c', order: 2, startMs: 8000, endMs: 9000 });
		dbState.manual = manual([a, b, c]);

		await expect(
			handleRegenerateJob(
				DB,
				structureJob({ scope: 'structure', prompt: 'merge the ends', stepIds: ['a', 'c'] })
			)
		).rejects.toThrow(/contiguous/);
		expect(dbState.saved).toHaveLength(0);
	});
});
