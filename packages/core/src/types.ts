import type { JobStatus, JobType, ManualStatus, StepReviewStatus } from './status.js';

export type ManualStep = {
	id: string;
	order: number;
	title: string;
	instruction: string;
	startMs: number;
	endMs: number;
	keyframeUrl: string;
	tools: string[];
	parts: string[];
	warnings: string[];
	confidence: number; // 0..1, the model's self-reported certainty
	reviewStatus: StepReviewStatus;
	sourceNotes: string[]; // why the AI proposed this (timestamps, audio cues, visual evidence)
	alternatives: string[]; // alternative phrasings/options the editor can choose from
	critique: string[]; // Critic (spec 10) flags: what is unsupported/missing; empty when well-supported
};

export type InstructionManual = {
	id: string;
	title: string;
	videoUrl: string;
	status: ManualStatus;
	steps: ManualStep[];
	createdAt: string; // ISO 8601
	updatedAt: string; // ISO 8601
};

// A reusable, generalizable heuristic distilled from a finished run (spec 11) —
// e.g. a tool/part naming convention, an audio cue, or a recurring warning. Not a
// per-video transcript line. Primed back into future generation prompts.
export type Learning = {
	id: string;
	scope: string; // a tag grouping related learnings for retrieval (e.g. 'warning', 'tool')
	text: string; // the generalizable heuristic itself
	sourceManualId: string; // the run this was distilled from
	createdAt: string; // ISO 8601
};

// A Learning before persistence — id and createdAt are assigned by the database.
export type NewLearning = Omit<Learning, 'id' | 'createdAt'>;

// The unit of work the web app enqueues and the engine consumes.
export type Job = {
	id: string;
	manualId: string;
	type: JobType;
	status: JobStatus;
	attempts: number;
	createdAt: string;
	updatedAt: string;
};
