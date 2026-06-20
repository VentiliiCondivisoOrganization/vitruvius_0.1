import {
	critiqueSteps,
	distillLearnings,
	segmentVideoIntoSteps,
	writeInstructions
} from '@vitruvius/ai';
import type { InstructionManual, Job } from '@vitruvius/core';
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
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';

const VIDEO_BUCKET = 'videos';
const SIGNED_URL_TTL_S = 600;

// Resolve a manual's videoUrl to a fetchable URL. The web app stores it as a Storage
// object key (e.g. `<id>/source.mp4`), so the engine signs it with its service-role
// client; an already-absolute http(s) URL is used as-is.
async function resolveVideoUrl(db: DbClient, videoUrl: string): Promise<string> {
	if (/^https?:\/\//.test(videoUrl)) return videoUrl;

	const { data, error } = await db.storage
		.from(VIDEO_BUCKET)
		.createSignedUrl(videoUrl, SIGNED_URL_TTL_S);
	if (error || !data?.signedUrl) {
		throw new Error(
			`sign video url failed for ${videoUrl}: ${error?.message ?? 'no url returned'}`
		);
	}
	return data.signedUrl;
}

// Stream the source video to a local file (the ffmpeg wrappers take a local path).
// Streaming avoids buffering the whole video in memory; guards a null response body.
async function downloadVideo(url: string, destPath: string): Promise<void> {
	const res = await fetch(url);
	if (!res.ok || !res.body) {
		throw new Error(`download video failed (${res.status}) for ${url}`);
	}
	// `res.body` is typed as the DOM ReadableStream; Readable.fromWeb wants the
	// node:stream/web variant. They are the same runtime object — bridge the types.
	const webStream = res.body as unknown as NodeWebReadableStream<Uint8Array>;
	await pipeline(Readable.fromWeb(webStream), createWriteStream(destPath));
}

/**
 * Run the full draft pipeline for a `process` job (spec 07):
 *   prime with learnings → media (ffmpeg) → segment → instructions → critic → save → distill.
 * The expensive media/segment work runs first; the Critic and learnings passes are cheap
 * text-only stages that never re-watch the video. On any failure the manual is marked
 * `failed` and the error is rethrown so the caller fails the job (never silent). Temp files
 * are cleaned up regardless of outcome.
 */
export async function handleProcessJob(db: DbClient, job: Job): Promise<void> {
	const manual = await getManual(db, job.manualId);
	if (!manual) throw new Error(`manual ${job.manualId} not found`);

	await setManualStatus(db, manual.id, 'processing');

	const workDir = await mkdtemp(join(tmpdir(), 'vitruvius-engine-'));
	try {
		// Prime: reusable heuristics from prior runs improve accuracy and cut credits.
		const priming = (await relevantLearnings(db)).map((l) => l.text);

		// Media: deterministic local extraction (the only expensive stage). All outputs
		// land under workDir so they can be cleaned up in one shot.
		const localVideo = join(workDir, 'source.mp4');
		await downloadVideo(await resolveVideoUrl(db, manual.videoUrl), localVideo);
		const videoDurationMs = await probeDurationMs(localVideo);
		const [scenes, keyframes] = await Promise.all([
			detectScenes(localVideo),
			extractKeyframes(localVideo, { outDir: join(workDir, 'keyframes') })
		]);

		// Generate: one segment pass, then enrich, then an independent critic pass.
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
		const enriched = await writeInstructions({
			steps: segmented,
			learnings: priming,
			manualId: manual.id
		});
		const reviewed = await critiqueSteps({
			steps: enriched,
			learnings: priming,
			manualId: manual.id
		});

		// Persist the finished manual.
		const finished: InstructionManual = {
			...manual,
			status: 'ready',
			steps: reviewed,
			updatedAt: new Date().toISOString()
		};
		await saveManual(db, finished);

		// Distill new learnings from the finished run. Auxiliary: a failure here must not
		// un-ready an already-saved manual, so it is logged, not thrown.
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
		// Best-effort: the worker is long-running, so never leak the downloaded video or
		// extracted keyframes once segmentation/instruction have consumed them.
		await rm(workDir, { recursive: true, force: true }).catch(() => {});
	}
}
