export const MANUAL_STATUS = ['uploaded', 'processing', 'ready', 'failed'] as const;
export type ManualStatus = (typeof MANUAL_STATUS)[number];

// Where a step came from / how trusted it is, surfaced in the editor.
export const STEP_REVIEW_STATUS = ['hypothesis', 'confirmed', 'edited'] as const;
export type StepReviewStatus = (typeof STEP_REVIEW_STATUS)[number];

// Job queue states (consumed by the engine worker).
export const JOB_STATUS = ['queued', 'running', 'done', 'failed'] as const;
export type JobStatus = (typeof JOB_STATUS)[number];

export const JOB_TYPE = ['process', 'export'] as const;
export type JobType = (typeof JOB_TYPE)[number];

// Whether an auxiliary digital model (CAD/mesh) primed a run, recorded on the manual so
// the Critic and editor can see a run was model-primed (spec 12-cad-ingest):
//   primed      — a usable model was parsed and fed to the AI as priming context
//   absent      — no model accompanied the upload
//   unsupported — a model was supplied but its format is recognized-but-unsupported
//   failed      — a supported model was supplied but could not be parsed
export const DIGITAL_MODEL_STATUS = ['primed', 'absent', 'unsupported', 'failed'] as const;
export type DigitalModelStatus = (typeof DIGITAL_MODEL_STATUS)[number];
