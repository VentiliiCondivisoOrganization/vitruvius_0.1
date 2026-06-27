import type { InstructionManual, ManualStatus } from '@vitruvius/core';
import type { DbClient } from './client.js';
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

// Delete a manual and everything that references it (steps and jobs cascade via
// their foreign keys). Used to roll back a half-created manual.
export async function deleteManual(client: DbClient, id: string): Promise<void> {
	const { error } = await client.from('manuals').delete().eq('id', id);
	if (error) throw new Error(`deleteManual: ${error.message}`);
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
