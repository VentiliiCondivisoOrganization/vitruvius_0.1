import type { JobStatus, JobType, ManualStatus, StepReviewStatus } from '@vitruvius/core';

// Snake_case shapes as stored in Postgres. These are the raw rows returned by the
// Supabase client; the mappers in mappers.ts convert them to the camelCase
// @vitruvius/core types and validate with the core zod schemas. Enum-like columns
// are typed as the core unions — the DB CHECK constraints mirror them, and the
// mappers re-validate with zod, so this is a safe compile-time tightening.

export type ManualRow = {
	id: string;
	title: string;
	video_url: string;
	bom_file_url: string;
	digital_model_url: string;
	status: ManualStatus;
	bom: unknown;
	created_at: string;
	updated_at: string;
};

export type StepRow = {
	id: string;
	manual_id: string;
	order: number;
	title: string;
	instruction: string;
	caption: string;
	start_ms: number;
	end_ms: number;
	keyframe_url: string;
	illustration_url: string;
	tools: string[];
	part_refs: unknown;
	warnings: string[];
	confidence: number;
	review_status: StepReviewStatus;
	source_notes: string[];
	alternatives: string[];
	critique: string[];
};

export type LearningRow = {
	id: string;
	scope: string;
	text: string;
	source_manual_id: string;
	created_at: string;
};

export type JobRow = {
	id: string;
	manual_id: string;
	type: JobType;
	status: JobStatus;
	attempts: number;
	last_error: string | null;
	// jsonb regenerate payload (spec 16); null for process/export. Validated by the
	// core zod schema in the mapper, so it is loosely typed here.
	payload: unknown;
	created_at: string;
	updated_at: string;
};
