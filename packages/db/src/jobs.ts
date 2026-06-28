import { JOB_TYPE, type Job, type JobType, type RegenerateRequest } from '@vitruvius/core';
import type { DbClient } from './client.js';
import { rowToJob } from './mappers.js';
import type { JobRow } from './types.js';

export async function enqueueJob(
	client: DbClient,
	input: { manualId: string; type: JobType; payload?: RegenerateRequest | null }
): Promise<Job> {
	const { data, error } = await client
		.from('jobs')
		.insert({ manual_id: input.manualId, type: input.type, payload: input.payload ?? null })
		.select('*')
		.single<JobRow>();

	if (error) throw new Error(`enqueueJob: ${error.message}`);
	return rowToJob(data);
}

// Atomically claim the oldest queued job of one of the given types (defaults to
// all types). Returns null when the queue is empty. Safe to call concurrently
// from multiple engine instances — see the claim_next_job SQL function.
export async function claimNextJob(
	client: DbClient,
	types: readonly JobType[] = JOB_TYPE
): Promise<Job | null> {
	const { data, error } = await client.rpc('claim_next_job', { p_types: [...types] });

	if (error) throw new Error(`claimNextJob: ${error.message}`);

	// The rpc is untyped (no generated Database type); the function returns 0..1
	// job rows. rowToJob validates the shape against the core schema.
	const rows = (data ?? []) as JobRow[];
	const row = rows[0];
	return row ? rowToJob(row) : null;
}

// Touch a running job's updated_at so reap_stale_jobs can distinguish a live long-running
// job (a multi-GB media stage writes nothing to the row for minutes) from an abandoned one.
// The no-op status write fires the jobs_set_updated_at trigger. Scoped to status='running'
// so a heartbeat that races a completeJob/failJob can't resurrect a finished job.
export async function heartbeatJob(client: DbClient, id: string): Promise<void> {
	const { error } = await client
		.from('jobs')
		.update({ status: 'running' })
		.eq('id', id)
		.eq('status', 'running');
	if (error) throw new Error(`heartbeatJob: ${error.message}`);
}

// Requeue (or fail, past the attempt cap) jobs whose worker died mid-run, so a crashed or
// OOM-killed engine doesn't wedge a manual in `processing` forever. Returns the reaped jobs
// for logging. See the reap_stale_jobs SQL function.
export async function reapStaleJobs(
	client: DbClient,
	opts: { leaseSeconds: number; maxAttempts: number }
): Promise<Job[]> {
	const { data, error } = await client.rpc('reap_stale_jobs', {
		p_lease: `${opts.leaseSeconds} seconds`,
		p_max_attempts: opts.maxAttempts
	});
	if (error) throw new Error(`reapStaleJobs: ${error.message}`);
	const rows = (data ?? []) as JobRow[];
	return rows.map(rowToJob);
}

export async function completeJob(client: DbClient, id: string): Promise<void> {
	const { error } = await client.from('jobs').update({ status: 'done' }).eq('id', id);
	if (error) throw new Error(`completeJob: ${error.message}`);
}

export async function failJob(client: DbClient, id: string, reason: string): Promise<void> {
	const { error } = await client
		.from('jobs')
		.update({ status: 'failed', last_error: reason })
		.eq('id', id);
	if (error) throw new Error(`failJob: ${error.message}`);
}
