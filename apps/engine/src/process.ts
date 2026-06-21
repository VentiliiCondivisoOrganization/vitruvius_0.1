import {
	critiqueSteps,
	disambiguateBomSteps,
	distillLearnings,
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
	relevantLearnings,
	saveLearnings,
	saveManual,
	setManualStatus,
	type DbClient
} from '@vitruvius/db';
import { detectScenes, extractKeyframes, probeDurationMs } from '@vitruvius/media';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';

const VIDEO_BUCKET = 'videos';
const SIGNED_URL_TTL_S = 600;

async function resolveStorageUrl(db: DbClient, objectKey: string): Promise<string> {
	if (/^https?:\/\//.test(objectKey)) return objectKey;

	const { data, error } = await db.storage
		.from(VIDEO_BUCKET)
		.createSignedUrl(objectKey, SIGNED_URL_TTL_S);
	if (error || !data?.signedUrl) {
		throw new Error(
			`sign storage url failed for ${objectKey}: ${error?.message ?? 'no url returned'}`
		);
	}
	return data.signedUrl;
}

async function downloadStorageObject(url: string, destPath: string): Promise<void> {
	const res = await fetch(url);
	if (!res.ok || !res.body) {
		throw new Error(`download failed (${res.status}) for ${url}`);
	}
	const webStream = res.body as unknown as NodeWebReadableStream<Uint8Array>;
	await pipeline(Readable.fromWeb(webStream), createWriteStream(destPath));
}

async function maybeDownload(db: DbClient, objectKey: string, destPath: string): Promise<boolean> {
	if (!objectKey.trim()) return false;
	await downloadStorageObject(await resolveStorageUrl(db, objectKey), destPath);
	return true;
}

/**
 * Run the full draft pipeline for a `process` job (spec 07):
 *   prime → media → segment → bom-map (13) → instruct → critic → save → distill.
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
		await downloadStorageObject(await resolveStorageUrl(db, manual.videoUrl), localVideo);

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
		const [scenes, keyframes] = await Promise.all([
			detectScenes(localVideo),
			extractKeyframes(localVideo, { outDir: join(workDir, 'keyframes') })
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

		const finished: InstructionManual = {
			...manual,
			status: 'ready',
			steps: reviewed,
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
