import {
	critiqueSteps,
	disambiguateBomSteps,
	distillLearnings,
	illustrateSteps,
	segmentVideoIntoSteps,
	writeInstructions
} from '@vitruvius/ai';
import {
	ingestModel,
	mapBomToSteps,
	parseBomFile,
	reconcileBom,
	type ParsedBomRow
} from '@vitruvius/cad';
import type { DigitalModel, InstructionManual, Job, ManualBomItem } from '@vitruvius/core';
import {
	getManual,
	presignVideoGet,
	relevantLearnings,
	saveLearnings,
	saveManual,
	setManualStatus,
	type DbClient
} from '@vitruvius/db';
import { detectScenes, extractKeyframes, probeDurationMs } from '@vitruvius/media';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { downloadStorageObject, maybeDownload } from './storage.js';

/**
 * Run the full draft pipeline for a `process` job (spec 07):
 *   prime → media → segment → bom-map (13) → instruct → critic → illustrate (14) → save → distill.
 * Optional CAD ingest (12) and BOM file run before segmentation output is enriched.
 */
export async function handleProcessJob(db: DbClient, job: Job): Promise<void> {
	const manual = await getManual(db, job.manualId);
	if (!manual) throw new Error(`manual ${job.manualId} not found`);

	await setManualStatus(db, manual.id, 'processing');

	const workDir = await mkdtemp(join(tmpdir(), 'vitruvius-engine-'));
	try {
		const priming = (await relevantLearnings(db)).map((l) => l.text);

		const localVideo = join(workDir, 'source.mp4');
		await downloadStorageObject(await presignVideoGet(db, manual.videoUrl), localVideo);

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

		const videoDurationMs = await probeDurationMs(localVideo);
		const keyframesDir = join(tmpdir(), 'vitruvius', 'keyframes', manual.id);
		await mkdir(keyframesDir, { recursive: true });

		const [scenes, keyframes] = await Promise.all([
			detectScenes(localVideo),
			extractKeyframes(localVideo, { outDir: keyframesDir })
		]);

		const segmented = await segmentVideoIntoSteps({
			videoUrl: manual.videoUrl,
			videoDurationMs,
			keyframes,
			scenes,
			clips: [],
			audio: null,
			learnings: priming,
			manualId: manual.id
		});

		const bomMapped = mapBomToSteps({ steps: segmented, manualBom });
		const bomSteps = await disambiguateBomSteps(
			{
				steps: bomMapped.steps,
				manualBom: bomMapped.manualBom,
				ambiguousStepOrders: bomMapped.ambiguousStepOrders
			},
			{ manualId: manual.id }
		);

		const enriched = await writeInstructions({
			steps: bomSteps,
			learnings: priming,
			manualId: manual.id
		});
		const reviewed = await critiqueSteps({
			steps: enriched,
			learnings: priming,
			manualId: manual.id
		});

		// Illustrate (spec 14) runs after the Critic. It is enrichment: a failure must not
		// fail the run, since keyframes remain the export evidence (spec 09). Like learnings,
		// errors are logged and the manual still saves `ready`.
		let illustrated = reviewed;
		try {
			illustrated = await illustrateSteps({
				steps: reviewed,
				outDir: join(tmpdir(), 'vitruvius', 'illustrations', manual.id),
				digitalModel,
				manualId: manual.id
			});
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			console.warn(`[engine] illustration skipped for ${manual.id}: ${reason}`);
		}

		const finished: InstructionManual = {
			...manual,
			status: 'ready',
			steps: illustrated,
			bom: bomMapped.manualBom,
			updatedAt: new Date().toISOString()
		};
		await saveManual(db, finished);

		try {
			const learned = await distillLearnings({
				manualId: manual.id,
				steps: reviewed,
				existingLearnings: priming
			});
			await saveLearnings(db, learned);
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			console.warn(`[engine] learnings distillation skipped for ${manual.id}: ${reason}`);
		}
	} catch (error) {
		await setManualStatus(db, manual.id, 'failed');
		throw error;
	} finally {
		await rm(workDir, { recursive: true, force: true }).catch(() => {});
	}
}
