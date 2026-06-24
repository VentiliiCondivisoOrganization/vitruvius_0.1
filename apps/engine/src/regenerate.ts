import { illustrateSteps, writeInstructions } from '@vitruvius/ai';
import {
	regenerateRequestSchema,
	type InstructionManual,
	type Job,
	type ManualStep,
	type PartRef,
	type RegenerateRequest
} from '@vitruvius/core';
import { getManual, relevantLearnings, saveManual, type DbClient } from '@vitruvius/db';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Trim, drop blanks, and de-duplicate a string list (mirrors the editor's `dedupe`). */
function dedupe(values: string[]): string[] {
	return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

/** De-duplicate part references by label, keeping the first occurrence. */
function dedupePartRefs(parts: PartRef[]): PartRef[] {
	const seen = new Set<string>();
	const out: PartRef[] = [];
	for (const part of parts) {
		const label = part.label.trim();
		if (!label || seen.has(label)) continue;
		seen.add(label);
		out.push(part);
	}
	return out;
}

/**
 * Fold contiguous steps into the first one — same field semantics as the editor's
 * `mergeWithNext` (spec 08): instructions joined, the widest time window, deduped
 * tools/parts/warnings, accumulated notes/alternatives/critique, and the lowest
 * confidence. The first step's id, keyframe, and order anchor the result.
 */
function mergeStepList(steps: ManualStep[]): ManualStep {
	return steps.reduce((acc, next) => ({
		...acc,
		instruction: [acc.instruction, next.instruction].filter(Boolean).join('\n\n'),
		startMs: Math.min(acc.startMs, next.startMs),
		endMs: Math.max(acc.endMs, next.endMs),
		tools: dedupe([...acc.tools, ...next.tools]),
		parts: dedupePartRefs([...acc.parts, ...next.parts]),
		warnings: dedupe([...acc.warnings, ...next.warnings]),
		sourceNotes: [...acc.sourceNotes, ...next.sourceNotes],
		alternatives: [...acc.alternatives, ...next.alternatives],
		critique: [...acc.critique, ...next.critique],
		confidence: Math.min(acc.confidence, next.confidence)
	}));
}

/**
 * Apply the `structure` scope (spec 16): a deterministic split or merge of the
 * editor-selected step(s) — the same operations the editor offers (spec 08) — then re-run
 * the Instructor on the affected step(s) so their wording matches the new boundaries,
 * steered by the user's prompt. Reuses existing agents; there is no separate "Regenerator".
 *
 * Convention (the editor selects a single step): one target → split at its midpoint; two or
 * more contiguous targets → merge into one. Re-segmentation from the source video is the
 * expensive, opt-in path the spec defers ("re-segment only when explicitly requested") and is
 * intentionally not done here — split/merge needs no video re-watch and spends no segment credits.
 */
async function restructureSteps(
	manual: InstructionManual,
	targets: ManualStep[],
	request: RegenerateRequest,
	learnings: string[]
): Promise<ManualStep[]> {
	const ordered = [...manual.steps].sort((a, b) => a.order - b.order);
	const sortedTargets = [...targets].sort((a, b) => a.order - b.order);

	// Ids touched by the structural change — re-instructed and demoted to `edited` below.
	const affectedIds = new Set<string>();
	let rebuilt: ManualStep[];

	if (sortedTargets.length === 1) {
		// ---- Split: bisect the step's time window (mirror editor `splitStep`) ----
		const original = sortedTargets[0];
		if (!original) throw new Error('regenerate structure: missing target step');
		const mid = Math.round((original.startMs + original.endMs) / 2);
		const first: ManualStep = { ...original, endMs: mid };
		// Both halves inherit the evidence so the Instructor can rewrite each window's
		// wording; the new half gets a fresh id and no carried-over illustration/critique.
		const second: ManualStep = {
			...original,
			id: randomUUID(),
			startMs: mid,
			endMs: original.endMs,
			sourceNotes: [...original.sourceNotes],
			tools: [...original.tools],
			parts: original.parts.map((part) => ({ ...part })),
			warnings: [...original.warnings],
			alternatives: [...original.alternatives],
			critique: [],
			caption: '',
			illustrationUrl: ''
		};
		affectedIds.add(first.id);
		affectedIds.add(second.id);
		rebuilt = ordered.flatMap((step) => (step.id === original.id ? [first, second] : [step]));
	} else {
		// ---- Merge: fold contiguous targets into the first (mirror editor `mergeWithNext`) ----
		const indices = sortedTargets.map((target) => {
			const idx = ordered.findIndex((s) => s.id === target.id);
			if (idx < 0) throw new Error('regenerate structure: target step not in manual');
			return idx;
		});
		const start = indices[0];
		const contiguous = indices.every((idx, i) => {
			if (i === 0) return true;
			const prev = indices[i - 1];
			return prev !== undefined && idx === prev + 1;
		});
		if (start === undefined || !contiguous) {
			throw new Error('regenerate structure: merge requires contiguous steps');
		}
		const merged = mergeStepList(sortedTargets);
		affectedIds.add(merged.id);
		rebuilt = [...ordered.slice(0, start), merged, ...ordered.slice(start + sortedTargets.length)];
	}

	// Renumber `order` sequentially over the rebuilt timeline.
	const renumbered = rebuilt.map((step, index) => ({ ...step, order: index }));

	// Re-instruct only the affected step(s), steered by the prompt; ids/order are preserved.
	const affected = renumbered.filter((step) => affectedIds.has(step.id));
	const reinstructed = await writeInstructions({
		steps: affected,
		learnings,
		manualId: manual.id,
		guidance: request.prompt
	});
	const byId = new Map(reinstructed.map((step) => [step.id, step]));

	// Demote the affected step(s) to `edited` so the human re-confirms.
	return renumbered.map((step) => {
		const next = byId.get(step.id);
		return next ? { ...next, reviewStatus: 'edited' as const } : step;
	});
}

/**
 * Re-derive the selected steps with the existing agents (spec 16) — no separate
 * "Regenerator". The user's prompt steers the agent as `guidance`. Returns the updated
 * steps for the targeted `stepIds` only. `structure` is handled separately by
 * `restructureSteps` (it changes step cardinality), so it is never routed here.
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
			// Routed to `restructureSteps` in `handleRegenerateJob` before reaching here.
			throw new Error('regenerate structure: handled by restructureSteps');
	}
}

/**
 * Handle a `regenerate` job (spec 16): re-run the Instructor or Illustrator on the
 * editor-selected step(s) under a natural-language prompt, persist the updated step(s),
 * and demote each to `edited` so the human re-confirms. The `structure` scope instead
 * splits/merges the selected step(s) and re-instructs the result. A failure surfaces on
 * the job row; `saveManual` replaces the step set in one transaction, so there is no
 * partial write.
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

	let steps: ManualStep[];
	if (request.scope === 'structure') {
		steps = await restructureSteps(manual, targets, request, learnings);
	} else {
		const regenerated = await regenerateTargets(manual.id, targets, request, learnings);
		const byId = new Map(regenerated.map((step) => [step.id, step]));
		steps = manual.steps.map((step) => {
			const next = byId.get(step.id);
			return next ? { ...next, reviewStatus: 'edited' as const } : step;
		});
	}

	const finished: InstructionManual = {
		...manual,
		steps,
		updatedAt: new Date().toISOString()
	};
	await saveManual(db, finished);
}
