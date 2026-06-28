import type { Job } from '@vitruvius/core';
import {
	claimNextJob,
	completeJob,
	createDbClient,
	failJob,
	heartbeatJob,
	reapStaleJobs,
	type DbClient
} from '@vitruvius/db';
import { handleEnrichJob } from './enrich.js';
import { handleExportJob } from './export.js';
import { handleProcessJob } from './process.js';
import { handleRegenerateJob } from './regenerate.js';

const POLL_INTERVAL_MS = Number(process.env.ENGINE_POLL_INTERVAL_MS ?? 2000);
// While a job runs, bump its row so the reaper can tell it apart from an abandoned one.
const HEARTBEAT_INTERVAL_MS = Number(process.env.ENGINE_HEARTBEAT_INTERVAL_MS ?? 30_000);
// How often to sweep for abandoned jobs, and how long without a heartbeat marks one dead.
// The lease must comfortably exceed the heartbeat interval (here ~5 missed beats).
const REAP_INTERVAL_MS = Number(process.env.ENGINE_REAP_INTERVAL_MS ?? 60_000);
const JOB_LEASE_SECONDS = Number(process.env.ENGINE_JOB_LEASE_SECONDS ?? 150);
const MAX_JOB_ATTEMPTS = Number(process.env.ENGINE_MAX_JOB_ATTEMPTS ?? 3);

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run `fn` while heartbeating the job, so a long stage (e.g. media: multi-GB download +
// ffmpeg) keeps the row fresh and the reaper leaves it alone. The first beat fires after one
// interval; claim_next_job already set updated_at = now(), which covers the gap until then.
async function withHeartbeat<T>(db: DbClient, jobId: string, fn: () => Promise<T>): Promise<T> {
	const timer = setInterval(() => {
		void heartbeatJob(db, jobId).catch((error) => {
			console.error(`[engine] heartbeat for job ${jobId} failed:`, error);
		});
	}, HEARTBEAT_INTERVAL_MS);
	timer.unref?.();
	try {
		return await fn();
	} finally {
		clearInterval(timer);
	}
}

let lastReapAt = 0;

// Requeue/fail jobs orphaned by a crashed worker. Gated to REAP_INTERVAL_MS and isolated so a
// reap failure (e.g. transient DB error) never stops us from claiming the next job.
async function reapIfDue(db: DbClient): Promise<void> {
	if (Date.now() - lastReapAt < REAP_INTERVAL_MS) return;
	lastReapAt = Date.now();
	try {
		const reaped = await reapStaleJobs(db, {
			leaseSeconds: JOB_LEASE_SECONDS,
			maxAttempts: MAX_JOB_ATTEMPTS
		});
		for (const job of reaped) {
			const outcome = job.status === 'queued' ? 'requeued' : 'failed (max attempts)';
			console.warn(
				`[engine] reaped stale job ${job.id} (${job.type}, attempt ${job.attempts}) → ${outcome}`
			);
		}
	} catch (error) {
		console.error('[engine] reap stale jobs error:', error);
	}
}

async function dispatch(db: DbClient, job: Job): Promise<void> {
	switch (job.type) {
		case 'process':
			await handleProcessJob(db, job);
			return;
		case 'export':
			await handleExportJob(db, job);
			return;
		case 'regenerate':
			await handleRegenerateJob(db, job);
			return;
		case 'enrich':
			await handleEnrichJob(db, job);
			return;
	}
}

async function tick(db: DbClient): Promise<void> {
	await reapIfDue(db);

	const job = await claimNextJob(db);
	if (!job) return;

	try {
		await withHeartbeat(db, job.id, () => dispatch(db, job));
		await completeJob(db, job.id);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		console.error(`[engine] job ${job.id} (${job.type}) failed: ${reason}`);
		await failJob(db, job.id, reason);
	}
}

// The engine bypasses RLS, so it MUST run with the service-role key. Fail fast
// here rather than surfacing opaque permission errors on the first query.
function engineDbClient(): DbClient {
	const url = process.env.PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url) throw new Error('[engine] PUBLIC_SUPABASE_URL is required');
	if (!key) throw new Error('[engine] SUPABASE_SERVICE_ROLE_KEY is required');
	return createDbClient({ url, key });
}

async function main(): Promise<void> {
	const db = engineDbClient();
	console.log(`[engine] worker started; polling every ${POLL_INTERVAL_MS}ms`);
	for (;;) {
		try {
			await tick(db);
		} catch (error) {
			// A failure to even claim a job (e.g. DB unavailable) must not kill the loop.
			console.error('[engine] poll tick error:', error);
		}
		await sleep(POLL_INTERVAL_MS);
	}
}

void main();
