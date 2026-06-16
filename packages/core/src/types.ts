import type { ManualStatus, StepReviewStatus, JobStatus, JobType } from "./status.js";

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
  confidence: number;            // 0..1, the model's self-reported certainty
  reviewStatus: StepReviewStatus;
  sourceNotes: string[];         // why the AI proposed this (timestamps, audio cues, visual evidence)
  alternatives: string[];        // alternative phrasings/options the editor can choose from
};

export type InstructionManual = {
  id: string;
  title: string;
  videoUrl: string;
  status: ManualStatus;
  steps: ManualStep[];
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
};

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
