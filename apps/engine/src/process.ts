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
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Fetch a remote source video into a local temp file so the ffmpeg wrappers (which
// take a local path) can read it. A local path is returned as-is.
async function resolveLocalVideo(videoUrl: string): Promise<string> {
	if (!/^https?:\/\//.test(videoUrl)) return videoUrl;

	const res = await fetch(videoUrl);
	if (!res.ok) throw new Error(`download video failed (${res.status}) for ${videoUrl}`);

	const dir = await mkdtemp(join(tmpdir(), 'vitruvius-engine-'));
	const path = join(dir, 'source.mp4');
	await writeFile(path, Buffer.from(await res.arrayBuffer()));
	return path;
}

/**
 * Run the full draft pipeline for a `process` job (spec 07):
 *   prime with learnings → media (ffmpeg) → segment → instructions → critic → save → distill.
 * The expensive media/segment work runs first; the Critic and learnings passes are cheap
 * text-only stages that never re-watch the video. On any failure the manual is marked
 * `failed` and the error is rethrown so the caller fails the job (never silent).
 */
export async function handleProcessJob(db: DbClient, job: Job): Promise<void> {
	const manual = await getManual(db, job.manualId);
	if (!manual) throw new Error(`manual ${job.manualId} not found`);

	await setManualStatus(db, manual.id, 'processing');

	try {
		// Prime: reusable heuristics from prior runs improve accuracy and cut credits.
		const priming = (await relevantLearnings(db)).map((l) => l.text);

		// Media: deterministic local extraction (the only expensive stage).
		const localVideo = await resolveLocalVideo(manual.videoUrl);
		const videoDurationMs = await probeDurationMs(localVideo);
		const [scenes, keyframes] = await Promise.all([
			detectScenes(localVideo),
			extractKeyframes(localVideo)
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
	}
}
