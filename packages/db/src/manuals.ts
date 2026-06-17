import type { InstructionManual } from '@vitruvius/core';
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
