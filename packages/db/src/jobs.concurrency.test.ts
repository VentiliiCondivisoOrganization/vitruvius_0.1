import type { InstructionManual } from '@vitruvius/core';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from './client.js';
import { claimNextJob, enqueueJob } from './jobs.js';
import { saveManual } from './manuals.js';

// Talks to a real local Supabase stack (`pnpm db:start`). Falls back to the
// well-known local CLI defaults so a fresh stack works with no extra config;
// override via env to point at another instance.
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY =
	process.env.SUPABASE_SERVICE_ROLE_KEY ??
	// Documented default local service_role key (not a secret — same on every local CLI).
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxNzk5NTM1NjAwfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';

const JOB_COUNT = 8;
const CLAIMER_COUNT = 16; // more claimers than jobs, so excess claims must come back empty

describe('claimNextJob concurrency', () => {
	let client: DbClient;
	let manualId: string;

	beforeAll(async () => {
		client = createDbClient({ url: SUPABASE_URL, key: SERVICE_ROLE_KEY });

		const now = new Date().toISOString();
		manualId = randomUUID();
		const manual: InstructionManual = {
			id: manualId,
			title: 'concurrency fixture',
			videoUrl: 'https://example.test/video.mp4',
			status: 'uploaded',
			steps: [],
			bom: [],
			createdAt: now,
			updatedAt: now
		};

		try {
			await saveManual(client, manual);
		} catch (err) {
			throw new Error(
				`Could not reach Supabase at ${SUPABASE_URL}. Start it with \`pnpm db:start && pnpm db:reset\`.`,
				{ cause: err }
			);
		}

		for (let i = 0; i < JOB_COUNT; i++) {
			await enqueueJob(client, { manualId, type: 'process' });
		}
	});

	afterAll(async () => {
		// Cascades to steps + jobs.
		if (manualId) await client.from('manuals').delete().eq('id', manualId);
	});

	it('never hands the same job to two concurrent claimers', async () => {
		const claims = await Promise.all(
			Array.from({ length: CLAIMER_COUNT }, () => claimNextJob(client, ['process']))
		);

		const claimed = claims.filter((job) => job !== null);
		const claimedIds = claimed.map((job) => job!.id);
		const uniqueIds = new Set(claimedIds);

		// Exactly JOB_COUNT jobs claimed, each exactly once, the rest came back empty.
		expect(claimed.length).toBe(JOB_COUNT);
		expect(uniqueIds.size).toBe(JOB_COUNT);
		expect(claims.filter((job) => job === null).length).toBe(CLAIMER_COUNT - JOB_COUNT);

		// Every claimed job is now 'running' with a recorded attempt.
		for (const job of claimed) {
			expect(job!.status).toBe('running');
			expect(job!.attempts).toBe(1);
		}
	});
});
