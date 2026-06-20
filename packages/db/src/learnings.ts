import { newLearningSchema, type Learning, type NewLearning } from '@vitruvius/core';
import type { DbClient } from './client.js';
import { rowToLearning } from './mappers.js';
import type { LearningRow } from './types.js';

const DEFAULT_RETRIEVAL_LIMIT = 20;

// Persist distilled learnings (spec 11). Each is validated against the core insert
// schema before it crosses into the database. Returns the stored rows (with their
// db-assigned id / createdAt). A no-op for an empty list.
export async function saveLearnings(
	client: DbClient,
	learnings: NewLearning[]
): Promise<Learning[]> {
	if (learnings.length === 0) return [];

	const rows = learnings.map((l) => {
		const parsed = newLearningSchema.parse(l);
		return { scope: parsed.scope, text: parsed.text, source_manual_id: parsed.sourceManualId };
	});

	const { data, error } = await client
		.from('learnings')
		.insert(rows)
		.select('*')
		.returns<LearningRow[]>();

	if (error) throw new Error(`saveLearnings: ${error.message}`);
	return (data ?? []).map(rowToLearning);
}

// Retrieve learnings relevant to a new run, most-recent first, to prime the
// Segmenter/Instructor prompts (spec 05/06). Filters by scope when given; otherwise
// returns the most recent across all scopes. Returns [] when the store is empty so
// generation degrades gracefully.
export async function relevantLearnings(
	client: DbClient,
	options: { scope?: string; limit?: number } = {}
): Promise<Learning[]> {
	const limit = options.limit ?? DEFAULT_RETRIEVAL_LIMIT;

	let query = client.from('learnings').select('*');
	if (options.scope) query = query.eq('scope', options.scope);

	const { data, error } = await query
		.order('created_at', { ascending: false })
		.limit(limit)
		.returns<LearningRow[]>();

	if (error) throw new Error(`relevantLearnings: ${error.message}`);
	return (data ?? []).map(rowToLearning);
}
