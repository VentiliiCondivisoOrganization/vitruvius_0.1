import type { InstructionManual } from '@vitruvius/core';
import * as exportPkg from '@vitruvius/export';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// @ts-ignore
import { handleProcessJob } from '../../../apps/engine/src/process.js';
// @ts-ignore
import { handleExportJob } from '../../../apps/engine/src/export.js';
import { createDbClient, type DbClient } from './client.js';
import { claimNextJob, enqueueJob } from './jobs.js';
import { getManual, saveManual } from './manuals.js';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';

describe('End-to-End Integration Pipeline', () => {
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
					cwd: __dirname,
					stdio: ['ignore', 'pipe', 'ignore']
				}).toString();
				const status = JSON.parse(statusJson);
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

		// Upload the video fixture to local Supabase Storage
		const videoData = await require('node:fs').readFileSync(videoFixturePath);
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
		} else {
			// Mock the renderManualPdf call to avoid needing Playwright Chromium installed
			vi.spyOn(exportPkg, 'renderManualPdf').mockImplementation(async (manual, options) => {
				const tempFile = join(options?.outDir ?? tempDir, `${manual.id}.pdf`);
				await writeFile(tempFile, '%PDF-1.4 dummy pdf content');
				return { fileRef: tempFile };
			});
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
