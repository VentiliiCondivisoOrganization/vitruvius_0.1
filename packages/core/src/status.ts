export const MANUAL_STATUS = ['uploaded', 'processing', 'ready', 'failed'] as const;
export type ManualStatus = (typeof MANUAL_STATUS)[number];

// Where a step came from / how trusted it is, surfaced in the editor.
export const STEP_REVIEW_STATUS = ['hypothesis', 'confirmed', 'edited'] as const;
export type StepReviewStatus = (typeof STEP_REVIEW_STATUS)[number];

// Job queue states (consumed by the engine worker).
export const JOB_STATUS = ['queued', 'running', 'done', 'failed'] as const;
export type JobStatus = (typeof JOB_STATUS)[number];

// Ordered pipeline stages of a `process` run (spec 07), surfaced as live progress while a
// manual is `processing`. The engine advances this stage-by-stage; the web derives a
// percentage from each stage's index, so ORDER IS SIGNIFICANT — append, never reorder.
// This is runtime telemetry, not part of the persisted InstructionManual document.
export const PROCESS_STAGE = [
	'priming', // gather relevant learnings to prime the run
	'media', // download video/aux, probe duration, detect scenes, extract keyframes
	'segmenting', // segment the video into candidate steps
	'bom', // map + disambiguate the bill of materials onto steps
	'instructing', // draft step instructions, captions, and tool lists
	'critiquing', // recalibrate confidence and raise critique flags
	'illustrating', // render schematic illustrations (best-effort)
	'finalizing' // persist the finished manual
] as const;
export type ProcessStage = (typeof PROCESS_STAGE)[number];

export const JOB_TYPE = ['process', 'export', 'regenerate', 'enrich'] as const;
export type JobType = (typeof JOB_TYPE)[number];

// Scope of a `regenerate` job (spec 16): which facet of the selected steps the AI
// re-derives from the editor's prompt. `structure` (split/merge/optional re-segment)
// is the expensive, opt-in scope.
export const REGENERATE_SCOPE = ['text', 'illustration', 'layout', 'structure'] as const;
export type RegenerateScope = (typeof REGENERATE_SCOPE)[number];

// Whether an auxiliary digital model (CAD/mesh) primed a run (spec 12-cad-ingest). This
// enum is the vocabulary for that outcome; wiring it onto the manual so the Critic and
// editor can see a run was model-primed lands with the engine CAD integration:
//   primed      — a usable model was parsed and fed to the AI as priming context
//   absent      — no model accompanied the upload
//   unsupported — a model was supplied but its format is recognized-but-unsupported
//   failed      — a supported model was supplied but could not be parsed
export const DIGITAL_MODEL_STATUS = ['primed', 'absent', 'unsupported', 'failed'] as const;
export type DigitalModelStatus = (typeof DIGITAL_MODEL_STATUS)[number];

// Provenance of a row in `InstructionManual.bom` after reconcile (spec 13-bom-map).
export const MANUAL_BOM_SOURCE = ['cad', 'file', 'inferred'] as const;
export type ManualBomSource = (typeof MANUAL_BOM_SOURCE)[number];
