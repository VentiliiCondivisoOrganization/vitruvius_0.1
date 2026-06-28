import type { InstructionManual, ManualStep } from '@vitruvius/core';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from './client.js';
import { deleteManual, getManual, retryManual, saveManual } from './manuals.js';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';

// Integration suite: needs a reachable Supabase stack (`pnpm db:start`, or a hosted project in
// CI). Any HTTP response means the stack is up; a connection error means it's absent — skip.
async function supabaseReachable(url: string): Promise<boolean> {
	try {
		await fetch(url, { signal: AbortSignal.timeout(2000) });
		return true;
	} catch {
		return false;
	}
}

const SUPABASE_REACHABLE = await supabaseReachable(SUPABASE_URL);
if (!SUPABASE_REACHABLE) {
	console.warn(`[packages/db] Supabase not reachable at ${SUPABASE_URL} — skipping retry tests.`);
}

function resolveServiceRoleKey(): string {
	const fromEnv = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (fromEnv) return fromEnv;
	try {
		const statusJson = execSync('npx supabase status -o json', {
			stdio: ['ignore', 'pipe', 'ignore']
		}).toString();
		const status = JSON.parse(statusJson);
		if (status.SERVICE_ROLE_KEY) return status.SERVICE_ROLE_KEY;
	} catch {
		// fall through to the well-known local demo key
	}
	return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxNzk5NTM1NjAwfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';
}

function makeStep(): ManualStep {
	return {
		id: randomUUID(),
		order: 0,
		title: 'Seeded step',
		instruction: 'do the thing',
		caption: '',
		startMs: 0,
		endMs: 1000,
		keyframeUrl: '',
		illustrationUrl: '',
		tools: [],
		parts: [],
		warnings: [],
		confidence: 0.5,
		reviewStatus: 'hypothesis',
		sourceNotes: [],
		alternatives: [],
		critique: []
	};
}

async function queuedProcessJobs(client: DbClient, manualId: string): Promise<number> {
	const { data, error } = await client
		.from('jobs')
		.select('id, type, status')
		.eq('manual_id', manualId)
		.eq('type', 'process')
		.eq('status', 'queued')
		.returns<{ id: string }[]>();
	if (error) throw new Error(error.message);
	return data?.length ?? 0;
}

describe.skipIf(!SUPABASE_REACHABLE)('retryManual', () => {
	let client: DbClient;
	let manualId: string;

	beforeAll(() => {
		client = createDbClient({ url: SUPABASE_URL, key: resolveServiceRoleKey() });
	});

	afterEach(async () => {
		if (manualId) await deleteManual(client, manualId).catch(() => {});
	});

	// Seed a `failed` manual with a step, a stale progress_stage + bom, and a prior failed job —
	// the shape a real failed run leaves behind (minus the partial output, added here on purpose).
	async function seedFailedManual(): Promise<string> {
		const id = randomUUID();
		const manual: InstructionManual = {
			id,
			title: 'Retry test',
			videoUrl: `retry-${id}.mp4`,
			bomFileUrl: '',
			digitalModelUrl: '',
			status: 'failed',
			steps: [makeStep()],
			bom: [],
			version: 1,
			parentVersionId: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};
		await saveManual(client, manual);
		// Stale telemetry + a non-empty derived bom, so the reset is observable.
		await client
			.from('manuals')
			.update({ progress_stage: 'instructing', bom: [{ id: 'b1', partName: 'P' }] })
			.eq('id', id);
		const { error } = await client
			.from('jobs')
			.insert({ manual_id: id, type: 'process', status: 'failed', last_error: 'boom' });
		if (error) throw new Error(error.message);
		return id;
	}

	it('resets a failed manual and enqueues exactly one process job', async () => {
		manualId = await seedFailedManual();

		const queued = await retryManual(client, manualId);
		expect(queued).toBe(true);

		const after = await getManual(client, manualId);
		expect(after?.status).toBe('processing');
		expect(after?.bom).toEqual([]);
		expect(after?.steps).toHaveLength(0);

		expect(await queuedProcessJobs(client, manualId)).toBe(1);
	});

	it('is a no-op on a non-failed manual and never enqueues duplicate jobs', async () => {
		manualId = await seedFailedManual();

		expect(await retryManual(client, manualId)).toBe(true);
		// Second call sees `processing` (the first already transitioned it) and must not re-queue.
		expect(await retryManual(client, manualId)).toBe(false);

		expect(await queuedProcessJobs(client, manualId)).toBe(1);
	});
});
