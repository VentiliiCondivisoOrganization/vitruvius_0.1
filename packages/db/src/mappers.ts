import {
	instructionManualSchema,
	jobSchema,
	learningSchema,
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
		status: manual.status,
		createdAt: manual.created_at,
		updatedAt: manual.updated_at,
		steps: [...steps]
			.sort((a, b) => a.order - b.order)
			.map((step) => ({
				id: step.id,
				order: step.order,
				title: step.title,
				instruction: step.instruction,
				startMs: step.start_ms,
				endMs: step.end_ms,
				keyframeUrl: step.keyframe_url,
				tools: step.tools,
				parts: step.parts,
				warnings: step.warnings,
				confidence: step.confidence,
				reviewStatus: step.review_status,
				sourceNotes: step.source_notes,
				alternatives: step.alternatives
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
		createdAt: job.created_at,
		updatedAt: job.updated_at
	};

	return jobSchema.parse(candidate);
}
