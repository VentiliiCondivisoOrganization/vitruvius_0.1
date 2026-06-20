import type { Job } from '@vitruvius/core';
import { claimNextJob, completeJob, createDbClient, failJob, type DbClient } from '@vitruvius/db';
import { handleExportJob } from './export.js';
import { handleProcessJob } from './process.js';

const POLL_INTERVAL_MS = Number(process.env.ENGINE_POLL_INTERVAL_MS ?? 2000);

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dispatch(db: DbClient, job: Job): Promise<void> {
	switch (job.type) {
		case 'process':
			await handleProcessJob(db, job);
			return;
		case 'export':
			await handleExportJob(db, job);
			return;
	}
}

async function tick(db: DbClient): Promise<void> {
	const job = await claimNextJob(db);
	if (!job) return;

	try {
		await dispatch(db, job);
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
