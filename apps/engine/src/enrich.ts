import { disambiguateBomSteps, illustrateSteps } from '@vitruvius/ai';
import {
	ingestModel,
	mapBomToSteps,
	parseBomFile,
	reconcileBom,
	type ParsedBomRow
} from '@vitruvius/cad';
import type { DigitalModel, InstructionManual, Job, ManualBomItem } from '@vitruvius/core';
import { getManual, saveManual, setManualStatus, type DbClient } from '@vitruvius/db';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { maybeDownload } from './storage.js';

/**
 * Handle an `enrich` job (spec 17): a new manual version (`parentVersionId` set, steps
 * already copied from the parent by `createManualVersion`) gains BOM/CAD that arrived after
 * the video-only run. Re-runs spec 13 bom-map and spec 14 illustrate on the EXISTING steps —
 * the timeline is never re-segmented — and saves the version `ready`. The parent stays
 * untouched, so v1 remains loadable and exportable.
 */
export async function handleEnrichJob(db: DbClient, job: Job): Promise<void> {
	const manual = await getManual(db, job.manualId);
	if (!manual) throw new Error(`manual ${job.manualId} not found`);
	if (!manual.parentVersionId) {
		throw new Error(`manual ${manual.id} is not an enrichment version (no parentVersionId)`);
	}

	await setManualStatus(db, manual.id, 'processing');

	const workDir = await mkdtemp(join(tmpdir(), 'vitruvius-enrich-'));
	try {
		let digitalModel: DigitalModel | null = null;
		if (manual.digitalModelUrl) {
			const modelExt = extname(manual.digitalModelUrl) || '.step';
			const localModel = join(workDir, `model${modelExt}`);
			if (await maybeDownload(db, manual.digitalModelUrl, localModel)) {
				digitalModel = await ingestModel(localModel);
			}
		}

		let fileBomRows: ParsedBomRow[] = [];
		if (manual.bomFileUrl) {
			const bomExt = extname(manual.bomFileUrl) || '.csv';
			const localBom = join(workDir, `bom${bomExt}`);
			if (await maybeDownload(db, manual.bomFileUrl, localBom)) {
				fileBomRows = await parseBomFile(localBom);
			}
		}

		const manualBom: ManualBomItem[] = reconcileBom(digitalModel, fileBomRows);

		// Re-map the BOM onto the existing steps — same timeline, no re-segmentation.
		const bomMapped = mapBomToSteps({ steps: manual.steps, manualBom });
		const bomSteps = await disambiguateBomSteps(
			{
				steps: bomMapped.steps,
				manualBom: bomMapped.manualBom,
				ambiguousStepOrders: bomMapped.ambiguousStepOrders
			},
			{ manualId: manual.id }
		);

		// Re-illustrate only when a CAD model is present (Compositor-lite on canonical views);
		// like the process pipeline this is non-fatal so a render failure can't fail the run.
		let steps = bomSteps;
		if (digitalModel?.status === 'primed') {
			try {
				steps = await illustrateSteps({
					steps: bomSteps,
					outDir: join(workDir, 'illustrations'),
					digitalModel,
					manualId: manual.id
				});
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				console.warn(`[engine] enrich illustration skipped for ${manual.id}: ${reason}`);
			}
		}

		const finished: InstructionManual = {
			...manual,
			status: 'ready',
			steps,
			bom: bomMapped.manualBom,
			updatedAt: new Date().toISOString()
		};
		await saveManual(db, finished);
	} catch (error) {
		await setManualStatus(db, manual.id, 'failed');
		throw error;
	} finally {
		await rm(workDir, { recursive: true, force: true }).catch(() => {});
	}
}
