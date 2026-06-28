import {
	PROCESS_STAGE,
	type InstructionManual,
	type ManualStatus,
	type ProcessStage
} from '@vitruvius/core';
import type { DbClient } from './client.js';
import { enqueueJob } from './jobs.js';
import { rowToManual } from './mappers.js';
import type { ManualRow, StepRow } from './types.js';

export async function getManual(client: DbClient, id: string): Promise<InstructionManual | null> {
	const { data: manual, error: manualError } = await client
		.from('manuals')
		.select('*')
		.eq('id', id)
		.maybeSingle<ManualRow>();

	if (manualError) throw new Error(`getManual: ${manualError.message}`);
	if (!manual) return null;

	const { data: steps, error: stepsError } = await client
		.from('steps')
		.select('*')
		.eq('manual_id', id)
		.order('order', { ascending: true })
		.returns<StepRow[]>();

	if (stepsError) throw new Error(`getManual steps: ${stepsError.message}`);

	return rowToManual(manual, steps ?? []);
}

// Upsert the manual and replace its steps atomically (see the save_manual SQL
// function). The manual is passed as-is; the function reads its camelCase fields.
export async function saveManual(client: DbClient, manual: InstructionManual): Promise<void> {
	const { error } = await client.rpc('save_manual', { p_manual: manual });
	if (error) throw new Error(`saveManual: ${error.message}`);
}

// Update only the manual's lifecycle status (e.g. processing → ready / failed),
// without touching its steps. The engine uses this to mark progress around the
// pipeline; the trigger keeps updated_at fresh.
export async function setManualStatus(
	client: DbClient,
	id: string,
	status: ManualStatus
): Promise<void> {
	const { error } = await client.from('manuals').update({ status }).eq('id', id);
	if (error) throw new Error(`setManualStatus: ${error.message}`);
}

// Record which pipeline stage a `process` run is on (spec 07), surfaced as live progress
// while the manual is `processing`. Runtime telemetry only: written directly here and read
// by getManualProgressStage — it never flows through save_manual or the manual document.
export async function setManualStage(
	client: DbClient,
	id: string,
	stage: ProcessStage
): Promise<void> {
	const { error } = await client.from('manuals').update({ progress_stage: stage }).eq('id', id);
	if (error) throw new Error(`setManualStage: ${error.message}`);
}

// Read the current pipeline stage for a manual, or null when none is set (not yet started,
// or a legacy row). Unknown values are treated as null so a stale code never breaks the UI.
export async function getManualProgressStage(
	client: DbClient,
	id: string
): Promise<ProcessStage | null> {
	const { data, error } = await client
		.from('manuals')
		.select('progress_stage')
		.eq('id', id)
		.maybeSingle<{ progress_stage: string | null }>();
	if (error) throw new Error(`getManualProgressStage: ${error.message}`);
	const stage = data?.progress_stage;
	return stage && (PROCESS_STAGE as readonly string[]).includes(stage)
		? (stage as ProcessStage)
		: null;
}

// Delete a manual and everything that references it (steps and jobs cascade via
// their foreign keys). Used to roll back a half-created manual.
export async function deleteManual(client: DbClient, id: string): Promise<void> {
	const { error } = await client.from('manuals').delete().eq('id', id);
	if (error) throw new Error(`deleteManual: ${error.message}`);
}

// Re-queue a failed manual for a clean re-run from the start. The pipeline only persists
// output on success (process.ts saves once at the end), so a failed manual normally has no
// steps — but we still wipe any persisted output defensively so a retry never resumes a
// half-written state: delete its steps and clear the derived `bom` and the stale failed
// `progress_stage`. The source inputs (video + BOM/model refs) are kept so the engine can
// reprocess. Then reset status to `processing` and enqueue a fresh `process` job. The prior
// failed job row is left as history; claim_next_job only ever picks up the new `queued` job.
// Only meaningful for a `failed` manual — the caller guards status.
export async function retryManual(client: DbClient, id: string): Promise<void> {
	const stepsResult = await client.from('steps').delete().eq('manual_id', id);
	if (stepsResult.error) throw new Error(`retryManual steps: ${stepsResult.error.message}`);

	const { error } = await client
		.from('manuals')
		.update({ status: 'processing', progress_stage: null, bom: [] })
		.eq('id', id);
	if (error) throw new Error(`retryManual: ${error.message}`);

	await enqueueJob(client, { manualId: id, type: 'process' });
}

// Count the caller's manuals (head request, no rows returned). The db client is
// RLS-scoped to the signed-in user, so this is inherently a per-user count — used by
// the upload quota guard. Pass `sinceIso` to count only manuals created on/after that
// timestamp (the rolling-window rate limit).
export async function countManuals(client: DbClient, sinceIso?: string): Promise<number> {
	// `head: true` returns no rows, only the count; select a single narrow column so
	// intent is clear and we don't couple to the table shape.
	let query = client.from('manuals').select('id', { count: 'exact', head: true });
	if (sinceIso) query = query.gte('created_at', sinceIso);

	const { count, error } = await query;
	if (error) throw new Error(`countManuals: ${error.message}`);
	return count ?? 0;
}

// Retrieve all manuals, mapped to the InstructionManual type (with steps).
export async function getManuals(client: DbClient): Promise<InstructionManual[]> {
	const { data: manuals, error: manualsError } = await client
		.from('manuals')
		.select('*')
		.order('created_at', { ascending: false })
		.returns<ManualRow[]>();

	if (manualsError) throw new Error(`getManuals: ${manualsError.message}`);
	if (!manuals || manuals.length === 0) return [];

	const manualIds = manuals.map((m) => m.id);
	const { data: allSteps, error: stepsError } = await client
		.from('steps')
		.select('*')
		.in('manual_id', manualIds)
		.returns<StepRow[]>();

	if (stepsError) throw new Error(`getManuals steps: ${stepsError.message}`);

	const stepsByManualId = new Map<string, StepRow[]>();
	for (const step of allSteps ?? []) {
		const list = stepsByManualId.get(step.manual_id) ?? [];
		list.push(step);
		stepsByManualId.set(step.manual_id, list);
	}

	return manuals.map((m) => rowToManual(m, stepsByManualId.get(m.id) ?? []));
}
