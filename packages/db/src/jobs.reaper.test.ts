import type { InstructionManual } from '@vitruvius/core';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from './client.js';
import { claimNextJob, enqueueJob, heartbeatJob, reapStaleJobs } from './jobs.js';
import { saveManual } from './manuals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkgRoot = join(__dirname, '..');

// Talks to a real local Supabase stack (`pnpm db:start`). Mirrors jobs.concurrency.test.ts.
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';

// Integration suite: needs a reachable Supabase stack (`pnpm db:start`, or a hosted project in CI).
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
	console.warn(`[packages/db] Supabase not reachable at ${SUPABASE_URL} — skipping reaper tests.`);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!SUPABASE_REACHABLE)('reapStaleJobs', () => {
	let client: DbClient;
	// reap_stale_jobs is global (it sweeps every stale job), and a requeued job goes back to
	// the front of the queue. So each test must start from an empty jobs table — otherwise a
	// later test's claimNextJob picks up an earlier test's leftover. Cleaned up in afterEach.
	const manualIds: string[] = [];

	async function freshManual(): Promise<string> {
		const now = new Date().toISOString();
		const id = randomUUID();
		const manual: InstructionManual = {
			id,
			title: 'reaper fixture',
			videoUrl: 'https://example.test/video.mp4',
			bomFileUrl: '',
			digitalModelUrl: '',
			status: 'processing',
			steps: [],
			bom: [],
			version: 1,
			parentVersionId: null,
			createdAt: now,
			updatedAt: now
		};
		await saveManual(client, manual);
		manualIds.push(id);
		return id;
	}

	beforeAll(async () => {
		let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
		if (!serviceRoleKey) {
			try {
				const statusJson = execSync('npx supabase status -o json', {
					cwd: pkgRoot,
					stdio: ['ignore', 'pipe', 'ignore']
				}).toString();
				serviceRoleKey = JSON.parse(statusJson).SERVICE_ROLE_KEY;
			} catch {
				serviceRoleKey =
					'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxNzk5NTM1NjAwfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';
			}
		}
		client = createDbClient({ url: SUPABASE_URL, key: serviceRoleKey! });
	});

	afterEach(async () => {
		// Cascades to jobs, leaving the queue empty for the next test.
		for (const id of manualIds) await client.from('manuals').delete().eq('id', id);
		manualIds.length = 0;
	});

	it('leaves a job that is still within its lease alone', async () => {
		const manualId = await freshManual();
		const job = await enqueueJob(client, { manualId, type: 'process' });
		await claimNextJob(client, ['process']);

		const reaped = await reapStaleJobs(client, { leaseSeconds: 60, maxAttempts: 3 });

		expect(reaped.map((j) => j.id)).not.toContain(job.id);
		const { data } = await client.from('jobs').select('status').eq('id', job.id).single();
		expect((data as { status: string }).status).toBe('running');
	});

	it('requeues a job whose worker stopped heartbeating, below the attempt cap', async () => {
		const manualId = await freshManual();
		const job = await enqueueJob(client, { manualId, type: 'process' });
		const claimed = await claimNextJob(client, ['process']);
		expect(claimed?.attempts).toBe(1);

		// Let the lease elapse with no heartbeat, simulating a dead worker.
		await sleep(1800);
		const reaped = await reapStaleJobs(client, { leaseSeconds: 1, maxAttempts: 3 });

		expect(reaped.map((j) => j.id)).toContain(job.id);
		const { data: jobRow } = await client
			.from('jobs')
			.select('status, attempts')
			.eq('id', job.id)
			.single();
		// Back in the queue for another attempt; the manual stays processing (it re-runs).
		expect((jobRow as { status: string }).status).toBe('queued');
		const { data: manualRow } = await client
			.from('manuals')
			.select('status')
			.eq('id', manualId)
			.single();
		expect((manualRow as { status: string }).status).toBe('processing');
	});

	it('a heartbeat keeps a long-running job from being reaped', async () => {
		const manualId = await freshManual();
		const job = await enqueueJob(client, { manualId, type: 'process' });
		await claimNextJob(client, ['process']);

		await sleep(1800);
		await heartbeatJob(client, job.id); // worker is alive and checking in
		const reaped = await reapStaleJobs(client, { leaseSeconds: 1, maxAttempts: 3 });

		expect(reaped.map((j) => j.id)).not.toContain(job.id);
	});

	it('fails the job and marks the manual failed once attempts hit the cap', async () => {
		const manualId = await freshManual();
		const job = await enqueueJob(client, { manualId, type: 'process' });
		await claimNextJob(client, ['process']);
		// Pretend this is the last allowed attempt.
		await client.from('jobs').update({ attempts: 3 }).eq('id', job.id);

		await sleep(1800);
		const reaped = await reapStaleJobs(client, { leaseSeconds: 1, maxAttempts: 3 });

		expect(reaped.find((j) => j.id === job.id)?.status).toBe('failed');
		const { data: jobRow } = await client
			.from('jobs')
			.select('status, last_error')
			.eq('id', job.id)
			.single();
		expect((jobRow as { status: string }).status).toBe('failed');
		expect((jobRow as { last_error: string | null }).last_error).toMatch(/reaped/);
		const { data: manualRow } = await client
			.from('manuals')
			.select('status')
			.eq('id', manualId)
			.single();
		expect((manualRow as { status: string }).status).toBe('failed');
	});
});
