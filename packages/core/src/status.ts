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
