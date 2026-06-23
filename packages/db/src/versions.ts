import type { InstructionManual, ManualStatus } from '@vitruvius/core';
import { randomUUID } from 'node:crypto';
import type { DbClient } from './client.js';
import { enqueueJob } from './jobs.js';
import { getManual, saveManual } from './manuals.js';

/** Lightweight row for listing a manual's version lineage without loading every step. */
export type ManualVersionSummary = {
	id: string;
	version: number;
	parentVersionId: string | null;
	status: ManualStatus;
	title: string;
	createdAt: string;
};

type VersionRow = {
	id: string;
	version: number;
	parent_version_id: string | null;
	status: ManualStatus;
	title: string;
	created_at: string;
};

const VERSION_COLUMNS = 'id, version, parent_version_id, status, title, created_at';

function rowToSummary(row: VersionRow): ManualVersionSummary {
	return {
		id: row.id,
		version: row.version,
		parentVersionId: row.parent_version_id,
		status: row.status,
		title: row.title,
		createdAt: row.created_at
	};
}

/**
 * Create the next version of a manual (spec 17): copy the parent on the SAME step
 * timeline, attach the new BOM/CAD upload refs, persist it as `processing`, and enqueue
 * an `enrich` job. Steps are copied with fresh ids — `steps.id` is globally unique and the
 * engine re-maps BOM / re-illustrates onto them. The parent (v1) stays untouched.
 */
export async function createManualVersion(
	client: DbClient,
	parentManualId: string,
	refs: { bomFileUrl?: string; digitalModelUrl?: string }
): Promise<InstructionManual> {
	const parent = await getManual(client, parentManualId);
	if (!parent) throw new Error(`createManualVersion: parent ${parentManualId} not found`);

	const now = new Date().toISOString();
	const next: InstructionManual = {
		...parent,
		id: randomUUID(),
		version: parent.version + 1,
		parentVersionId: parent.id,
		bomFileUrl: refs.bomFileUrl ?? parent.bomFileUrl,
		digitalModelUrl: refs.digitalModelUrl ?? parent.digitalModelUrl,
		status: 'processing',
		steps: parent.steps.map((step) => ({ ...step, id: randomUUID() })),
		createdAt: now,
		updatedAt: now
	};

	await saveManual(client, next);
	await enqueueJob(client, { manualId: next.id, type: 'enrich' });
	return next;
}

async function fetchVersionRow(client: DbClient, id: string): Promise<VersionRow | null> {
	const { data, error } = await client
		.from('manuals')
		.select(VERSION_COLUMNS)
		.eq('id', id)
		.maybeSingle<VersionRow>();
	if (error) throw new Error(`listManualVersions: ${error.message}`);
	return data ?? null;
}

/**
 * List every version in a manual's lineage, oldest first, given any member's id. Walks up
 * to the lineage root via `parentVersionId`, then collects descendants. The MVP chain is
 * linear (v1 → v2), but the walk handles branches defensively.
 */
export async function listManualVersions(
	client: DbClient,
	manualId: string
): Promise<ManualVersionSummary[]> {
	let root = await fetchVersionRow(client, manualId);
	if (!root) return [];
	while (root.parent_version_id) {
		const parent = await fetchVersionRow(client, root.parent_version_id);
		if (!parent) break;
		root = parent;
	}

	const all: VersionRow[] = [];
	const queue: VersionRow[] = [root];
	while (queue.length > 0) {
		const node = queue.shift()!;
		all.push(node);
		const { data, error } = await client
			.from('manuals')
			.select(VERSION_COLUMNS)
			.eq('parent_version_id', node.id)
			.returns<VersionRow[]>();
		if (error) throw new Error(`listManualVersions: ${error.message}`);
		for (const child of data ?? []) queue.push(child);
	}

	return all.sort((a, b) => a.version - b.version).map(rowToSummary);
}
