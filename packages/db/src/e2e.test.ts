import {
	HeuristicBomDisambiguateProvider,
	resetBomDisambiguateProviderFactory,
	setBomDisambiguateProviderFactory
} from '@vitruvius/ai';
import {
	checkExportGate,
	type InstructionManual,
	type Job,
	type ManualStep
} from '@vitruvius/core';
import type { RenderPdfOptions } from '@vitruvius/export';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkgRoot = join(__dirname, '..');

// Mock `@vitruvius/export`'s renderManualPdf dynamically to support environments without Chromium
vi.mock('@vitruvius/export', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@vitruvius/export')>();
	return {
		...actual,
		renderManualPdf: async (manual: InstructionManual, options?: RenderPdfOptions) => {
			if (process.env.PLAYWRIGHT_CHROMIUM_PATH) {
				return actual.renderManualPdf(manual, options);
			}
			const { join } = await import('node:path');
			const { writeFile } = await import('node:fs/promises');
			const tempFile = join(options?.outDir ?? '/tmp', `${manual.id}.pdf`);
			await writeFile(tempFile, '%PDF-1.4 dummy pdf content');
			return { fileRef: tempFile };
		}
	};
});

import { createDbClient, type DbClient } from './client.js';
import { claimNextJob, enqueueJob } from './jobs.js';
import { getManual, saveManual } from './manuals.js';
import { createManualVersion, listManualVersions } from './versions.js';

const enrichPath = '../../../apps/engine/src/enrich.js';
const { handleEnrichJob } = (await import(enrichPath)) as {
	handleEnrichJob: (db: DbClient, job: Job) => Promise<void>;
};

// We dynamically import these to avoid pulling apps/engine source files into the tsconfig rootDir / compilation list of packages/db.
const processPath = '../../../apps/engine/src/process.js';
const exportPath = '../../../apps/engine/src/export.js';
const { handleProcessJob } = (await import(processPath)) as {
	handleProcessJob: (db: DbClient, job: Job) => Promise<void>;
};
const { handleExportJob } = (await import(exportPath)) as {
	handleExportJob: (db: DbClient, job: Job) => Promise<void>;
};

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';

// Integration suite: needs a reachable Supabase stack (`pnpm db:start`, or a hosted project in CI).
// Any HTTP response means the stack is up; a connection error means it's absent — skip, don't fail.
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
	console.warn(
		`[packages/db] Supabase not reachable at ${SUPABASE_URL} — skipping integration tests.`
	);
}

describe.skipIf(!SUPABASE_REACHABLE)('End-to-End Integration Pipeline', () => {
	let client: DbClient;
	let manualId: string;
	let tempDir: string;
	let videoFixturePath: string;
	const videoObjectKey = `test-video-${randomUUID()}.mp4`;

	beforeAll(async () => {
		let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
		if (!serviceRoleKey) {
			try {
				const statusJson = execSync('npx supabase status -o json', {
					cwd: pkgRoot,
					stdio: ['ignore', 'pipe', 'ignore']
				}).toString();
				const status = JSON.parse(statusJson);
				if (!status.SERVICE_ROLE_KEY) {
					throw new Error('SERVICE_ROLE_KEY not found in status JSON');
				}
				serviceRoleKey = status.SERVICE_ROLE_KEY;
			} catch {
				serviceRoleKey =
					'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxNzk5NTM1NjAwfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';
			}
		}

		client = createDbClient({ url: SUPABASE_URL, key: serviceRoleKey! });
		tempDir = await mkdtemp(join(tmpdir(), 'vitruvius-e2e-'));

		// Build a 1-second dummy video fixture using ffmpeg
		videoFixturePath = join(tempDir, 'fixture.mp4');
		try {
			execSync(
				`ffmpeg -y -f lavfi -i testsrc=s=320x240:d=1:r=25 -f lavfi -i sine=frequency=440:duration=1 -c:v libx264 -c:a aac -pix_fmt yuv420p ${videoFixturePath}`,
				{ stdio: 'ignore' }
			);
		} catch (err) {
			throw new Error('ffmpeg failed to build fixture. Is ffmpeg installed?', { cause: err });
		}

		// Upload the video fixture to local Supabase Storage using ESM-friendly read
		const videoData = readFileSync(videoFixturePath);
		const { error: uploadError } = await client.storage
			.from('videos')
			.upload(videoObjectKey, videoData, { contentType: 'video/mp4' });

		if (uploadError) {
			throw new Error(`Failed to upload test video to Supabase: ${uploadError.message}`);
		}

		// Set up Chromium executable path fallback
		let executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
		if (!executablePath && process.platform === 'darwin') {
			const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
			if (existsSync(macChrome)) {
				executablePath = macChrome;
			}
		}

		if (executablePath) {
			process.env.PLAYWRIGHT_CHROMIUM_PATH = executablePath;
		}
	});

	afterAll(async () => {
		// Clean up database rows (cascades to steps + jobs)
		if (manualId) {
			await client.from('manuals').delete().eq('id', manualId);
		}
		// Clean up storage objects
		await client.storage.from('videos').remove([videoObjectKey]);
		if (manualId) {
			await client.storage.from('exports').remove([`${manualId}.pdf`]);
		}
		// Clean up temp files
		await rm(tempDir, { recursive: true, force: true }).catch(() => {});
	});

	it('runs the full process and export pipeline from video to PDF', async () => {
		const now = new Date().toISOString();
		manualId = randomUUID();

		const manual: InstructionManual = {
			id: manualId,
			title: 'E2E Integration Manual',
			videoUrl: videoObjectKey,
			bomFileUrl: '',
			digitalModelUrl: '',
			status: 'uploaded',
			steps: [],
			bom: [],
			version: 1,
			parentVersionId: null,
			createdAt: now,
			updatedAt: now
		};

		// 1. Save manual
		await saveManual(client, manual);

		// 2. Enqueue and claim a process job
		await enqueueJob(client, { manualId, type: 'process' });
		const processJob = await claimNextJob(client, ['process']);
		expect(processJob).not.toBeNull();
		expect(processJob!.manualId).toBe(manualId);

		// 3. Process the manual (runs AI segmentation, instruction writer, critic, learnings)
		await handleProcessJob(client, processJob!);

		// 4. Verify manual was processed and has steps/status ready
		const processedManual = await getManual(client, manualId);
		expect(processedManual).not.toBeNull();
		expect(processedManual!.status).toBe('ready');
		expect(processedManual!.steps.length).toBeGreaterThan(0);

		// Simulate human confirmation of all steps (required by the export gate)
		for (const step of processedManual!.steps) {
			step.reviewStatus = 'confirmed';
		}
		await saveManual(client, processedManual!);

		// 5. Enqueue and claim an export job
		await enqueueJob(client, { manualId, type: 'export' });
		const exportJob = await claimNextJob(client, ['export']);
		expect(exportJob).not.toBeNull();

		// 6. Export the manual (renders HTML and PDF)
		await handleExportJob(client, exportJob!);

		// 7. Verify the PDF was uploaded to the exports bucket
		const { data: list, error: listError } = await client.storage.from('exports').list();
		expect(listError).toBeNull();
		const exportedFile = list?.find((f) => f.name === `${manualId}.pdf`);
		expect(exportedFile).toBeDefined();
	});
});

// Spec 17 — manual versioning. Enriching a video-only v1 with a BOM file that arrives later
// must produce v2 on the SAME step timeline (no re-segmentation), populate `PartRef` codes
// where mappable, surface ambiguous parts as blocking `candidateBomItemIds`, carry the human
// edits forward unchanged, and leave v1 frozen yet still exportable.
describe.skipIf(!SUPABASE_REACHABLE)('Manual versioning enrich (spec 17)', () => {
	let client: DbClient;
	const bomObjectKey = `test-bom-${randomUUID()}.csv`;
	let v1Id: string;
	let v2Id: string;

	// A BOM where one part name appears alone in a step (clean map) and two appear together
	// in another (ambiguous → blocking candidates).
	const BOM_CSV = [
		'part_name,part_number,description,qty',
		'Left Bracket,LB-100,Steel left mounting bracket,1',
		'M6 Bolt,B-M6,Hex head bolt,4',
		'Lock Nut,N-M6,Nylon lock nut,4'
	].join('\n');

	function buildStep(overrides: Partial<ManualStep>): ManualStep {
		return {
			id: randomUUID(),
			order: 0,
			title: 'Step',
			instruction: '',
			caption: '',
			startMs: 0,
			endMs: 1000,
			keyframeUrl: 'kf.jpg',
			illustrationUrl: '',
			tools: [],
			parts: [],
			warnings: [],
			confidence: 0.9,
			reviewStatus: 'confirmed',
			sourceNotes: [],
			alternatives: [],
			critique: [],
			...overrides
		};
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

		// Force the deterministic heuristic disambiguator so the test never depends on a
		// GEMINI key or network — it must keep ambiguous candidates as-is, which is what
		// blocks the export gate below.
		setBomDisambiguateProviderFactory(() => new HeuristicBomDisambiguateProvider());

		// The enrich handler reads the BOM from the `videos` bucket (same as the engine).
		const { error: uploadError } = await client.storage
			.from('videos')
			.upload(bomObjectKey, Buffer.from(BOM_CSV), { contentType: 'text/csv' });
		if (uploadError) {
			throw new Error(`Failed to upload BOM fixture: ${uploadError.message}`);
		}
	});

	afterAll(async () => {
		resetBomDisambiguateProviderFactory();
		// v2 first (child) then v1 — parent_version_id is ON DELETE SET NULL, but delete the
		// child first to be explicit. Both cascade to steps + jobs.
		if (v2Id) await client.from('manuals').delete().eq('id', v2Id);
		if (v1Id) await client.from('manuals').delete().eq('id', v1Id);
		await client.storage.from('videos').remove([bomObjectKey]);
	});

	it('enriches v1 → v2 on the same timeline, preserving edits and blocking on new BOM choices', async () => {
		const now = new Date().toISOString();
		v1Id = randomUUID();

		// A human-reviewed, video-only v1: two confirmed steps with hand-edited instructions
		// and no parts yet (the BOM had not arrived).
		const v1: InstructionManual = {
			id: v1Id,
			title: 'Shelf assembly',
			videoUrl: 'https://example.test/video.mp4',
			bomFileUrl: '',
			digitalModelUrl: '',
			status: 'ready',
			steps: [
				buildStep({
					order: 0,
					title: 'Attach the left bracket',
					instruction: 'Human edit: bolt the left bracket onto the frame.',
					sourceNotes: ['mount the Left Bracket to the frame'],
					startMs: 0,
					endMs: 5000
				}),
				buildStep({
					order: 1,
					title: 'Secure with fasteners',
					instruction: 'Human edit: tighten everything by hand first.',
					sourceNotes: ['use the M6 Bolt and the Lock Nut'],
					startMs: 5000,
					endMs: 12000
				})
			],
			bom: [],
			version: 1,
			parentVersionId: null,
			createdAt: now,
			updatedAt: now
		};
		await saveManual(client, v1);

		// v1 (no parts, all confirmed) is exportable before enrichment.
		expect(checkExportGate(v1).ok).toBe(true);

		// The editor stores the late BOM file and calls createManualVersion → enqueues `enrich`.
		const v2 = await createManualVersion(client, v1Id, { bomFileUrl: bomObjectKey });
		v2Id = v2.id;
		expect(v2.version).toBe(2);
		expect(v2.parentVersionId).toBe(v1Id);
		expect(v2.status).toBe('processing');

		const enrichJob = await claimNextJob(client, ['enrich']);
		expect(enrichJob).not.toBeNull();
		expect(enrichJob!.manualId).toBe(v2Id);

		await handleEnrichJob(client, enrichJob!);

		const enriched = await getManual(client, v2Id);
		expect(enriched).not.toBeNull();
		expect(enriched!.status).toBe('ready');

		// Same timeline: identical step count and time bounds (no re-segmentation).
		expect(enriched!.steps).toHaveLength(2);
		const step0 = enriched!.steps.find((s) => s.order === 0)!;
		const step1 = enriched!.steps.find((s) => s.order === 1)!;
		expect(step0.startMs).toBe(0);
		expect(step0.endMs).toBe(5000);
		expect(step1.startMs).toBe(5000);
		expect(step1.endMs).toBe(12000);

		// Human work carried forward unchanged.
		expect(step0.title).toBe('Attach the left bracket');
		expect(step0.instruction).toBe('Human edit: bolt the left bracket onto the frame.');
		expect(step0.reviewStatus).toBe('confirmed');
		expect(step1.instruction).toBe('Human edit: tighten everything by hand first.');

		// Cleanly mappable part → populated PartRef with its BOM code.
		expect(step0.parts).toHaveLength(1);
		expect(step0.parts[0]!.bomItemId).not.toBeNull();
		expect(step0.parts[0]!.bomCode).toBe('LB-100');

		// Ambiguous part (two BOM names in one step) → open candidates, no resolved id.
		expect(step1.parts).toHaveLength(1);
		expect(step1.parts[0]!.bomItemId).toBeNull();
		expect(step1.parts[0]!.candidateBomItemIds).toHaveLength(2);

		// The reconciled BOM is carried onto the version.
		expect(enriched!.bom).toHaveLength(3);

		// Export gate blocks on the open candidate even though every step is confirmed.
		const gate = checkExportGate(enriched!);
		expect(gate.ok).toBe(false);
		if (!gate.ok) expect(gate.reason).toContain('BOM');

		// v1 stays frozen-but-exportable and untouched.
		const v1After = await getManual(client, v1Id);
		expect(v1After!.status).toBe('ready');
		expect(v1After!.steps.every((s) => s.parts.length === 0)).toBe(true);
		expect(checkExportGate(v1After!).ok).toBe(true);

		// Lineage lists oldest-first from either id.
		const lineage = await listManualVersions(client, v2Id);
		expect(lineage.map((v) => v.version)).toEqual([1, 2]);
		expect(lineage.map((v) => v.id)).toEqual([v1Id, v2Id]);
	});
});
