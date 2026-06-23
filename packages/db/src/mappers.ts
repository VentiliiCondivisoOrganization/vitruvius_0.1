import {
	instructionManualSchema,
	jobSchema,
	learningSchema,
	partRefSchema,
	type InstructionManual,
	type Job,
	type Learning
} from '@vitruvius/core';
import type { JobRow, LearningRow, ManualRow, StepRow } from './types.js';

// All reads cross the trust boundary through these mappers: snake_case row →
// camelCase core type → validated by the core zod schema. A schema drift between
// the migration and the contract fails loudly here rather than leaking bad data.

export function rowToManual(manual: ManualRow, steps: StepRow[]): InstructionManual {
	const candidate = {
		id: manual.id,
		title: manual.title,
		videoUrl: manual.video_url,
		bomFileUrl: manual.bom_file_url ?? '',
		digitalModelUrl: manual.digital_model_url ?? '',
		status: manual.status,
		bom: manual.bom ?? [],
		version: manual.version ?? 1,
		parentVersionId: manual.parent_version_id ?? null,
		createdAt: manual.created_at,
		updatedAt: manual.updated_at,
		steps: [...steps]
			.sort((a, b) => a.order - b.order)
			.map((step) => ({
				id: step.id,
				order: step.order,
				title: step.title,
				instruction: step.instruction,
				caption: step.caption,
				startMs: step.start_ms,
				endMs: step.end_ms,
				keyframeUrl: step.keyframe_url,
				illustrationUrl: step.illustration_url,
				tools: step.tools,
				parts: partRefSchema.array().parse(step.part_refs ?? []),
				warnings: step.warnings,
				confidence: step.confidence,
				reviewStatus: step.review_status,
				sourceNotes: step.source_notes,
				alternatives: step.alternatives,
				critique: step.critique
			}))
	};

	return instructionManualSchema.parse(candidate);
}

export function rowToLearning(learning: LearningRow): Learning {
	const candidate = {
		id: learning.id,
		scope: learning.scope,
		text: learning.text,
		sourceManualId: learning.source_manual_id,
		createdAt: learning.created_at
	};

	return learningSchema.parse(candidate);
}

export function rowToJob(job: JobRow): Job {
	const candidate = {
		id: job.id,
		manualId: job.manual_id,
		type: job.type,
		status: job.status,
		attempts: job.attempts,
		payload: job.payload ?? null,
		createdAt: job.created_at,
		updatedAt: job.updated_at
	};

	return jobSchema.parse(candidate);
}
