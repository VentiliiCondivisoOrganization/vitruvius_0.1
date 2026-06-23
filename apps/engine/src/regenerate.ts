import { illustrateSteps, writeInstructions } from '@vitruvius/ai';
import {
	regenerateRequestSchema,
	type InstructionManual,
	type Job,
	type ManualStep,
	type RegenerateRequest
} from '@vitruvius/core';
import { getManual, relevantLearnings, saveManual, type DbClient } from '@vitruvius/db';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Re-derive the selected steps with the existing agents (spec 16) — no separate
 * "Regenerator". The user's prompt steers the agent as `guidance`. Returns the updated
 * steps for the targeted `stepIds` only.
 */
async function regenerateTargets(
	manualId: string,
	targets: ManualStep[],
	request: RegenerateRequest,
	learnings: string[]
): Promise<ManualStep[]> {
	switch (request.scope) {
		case 'text':
			return writeInstructions({ steps: targets, learnings, manualId, guidance: request.prompt });
		case 'illustration':
		case 'layout': {
			// Illustrations are written to a persistent dir and referenced as file refs (spec 14).
			const outDir = join(tmpdir(), 'vitruvius', 'illustrations', manualId);
			return await illustrateSteps({
				steps: targets,
				outDir,
				manualId,
				guidance: request.prompt
			});
		}
		case 'structure':
			// Split/merge/re-segment is the expensive, opt-in scope — editor operations cover
			// split/merge today (spec 08); engine-side structural regen lands later.
			throw new Error("regenerate scope 'structure' is not supported yet");
	}
}

/**
 * Handle a `regenerate` job (spec 16): re-run the Instructor or Illustrator on the
 * editor-selected step(s) under a natural-language prompt, persist the updated step(s),
 * and demote each to `edited` so the human re-confirms. A failure surfaces on the job row;
 * `saveManual` replaces the step set in one transaction, so there is no partial write.
 */
export async function handleRegenerateJob(db: DbClient, job: Job): Promise<void> {
	// The payload is validated again here (defense in depth) — a malformed or null payload
	// fails the job loudly rather than silently no-op'ing.
	const request = regenerateRequestSchema.parse(job.payload);

	const manual = await getManual(db, job.manualId);
	if (!manual) throw new Error(`manual ${job.manualId} not found`);
	if (manual.status !== 'ready') {
		throw new Error(`manual ${manual.id} is not ready to regenerate (status: ${manual.status})`);
	}

	const targetIds = new Set(request.stepIds);
	const targets = manual.steps.filter((step) => targetIds.has(step.id));
	if (targets.length === 0) {
		throw new Error(`regenerate: no matching steps for manual ${manual.id}`);
	}

	const learnings = (await relevantLearnings(db)).map((l) => l.text);
	const regenerated = await regenerateTargets(manual.id, targets, request, learnings);

	const byId = new Map(regenerated.map((step) => [step.id, step]));
	const steps = manual.steps.map((step) => {
		const next = byId.get(step.id);
		return next ? { ...next, reviewStatus: 'edited' as const } : step;
	});

	const finished: InstructionManual = {
		...manual,
		steps,
		updatedAt: new Date().toISOString()
	};
	await saveManual(db, finished);
}
