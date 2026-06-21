import type { Job } from '@vitruvius/core';
import { getManual, type DbClient } from '@vitruvius/db';
import { renderManualPdf } from '@vitruvius/export';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EXPORT_BUCKET = 'exports';

/** Storage object key for a manual's exported PDF — derived only from the manual id. */
export function exportObjectKey(manualId: string): string {
	return `${manualId}.pdf`;
}

/**
 * Render a `ready` manual to PDF with Playwright and store it in Supabase Storage
 * (spec 09). The web app offers the download once this object exists. Playwright and
 * its Chromium binary live in the engine container, never in apps/web.
 */
export async function handleExportJob(db: DbClient, job: Job): Promise<void> {
	const manual = await getManual(db, job.manualId);
	if (!manual) throw new Error(`manual ${job.manualId} not found`);
	if (manual.status !== 'ready') {
		throw new Error(`manual ${manual.id} is not ready (status: ${manual.status})`);
	}

	// Own the render directory here so it is always cleaned up — the long-running worker
	// must not leak temp PDFs once they have been read and uploaded.
	const outDir = await mkdtemp(join(tmpdir(), 'vitruvius-export-'));
	try {
		const { fileRef } = await renderManualPdf(manual, { outDir });
		const pdf = await readFile(fileRef);

		const { error } = await db.storage
			.from(EXPORT_BUCKET)
			.upload(exportObjectKey(manual.id), pdf, { contentType: 'application/pdf', upsert: true });

		if (error) throw new Error(`store export PDF: ${error.message}`);
	} finally {
		await rm(outDir, { recursive: true, force: true }).catch(() => {});
	}
}
