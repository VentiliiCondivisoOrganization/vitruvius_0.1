-- Spec 07-engine — live progress for a `process` run.
--
-- Adds a nullable `progress_stage` to manuals so the engine can report which pipeline
-- stage it is on while status is 'processing'; the web derives a percentage from it.
-- This is runtime telemetry, not part of the persisted InstructionManual document, so it
-- is written/read directly (setManualStage / getManualProgressStage) and never flows
-- through save_manual or rowToManual. The CHECK mirrors @vitruvius/core PROCESS_STAGE as a
-- defense-in-depth backstop; keep the two in sync.
ALTER TABLE manuals
ADD COLUMN progress_stage text CHECK (
	progress_stage IN (
		'priming',
		'media',
		'segmenting',
		'bom',
		'instructing',
		'critiquing',
		'illustrating',
		'finalizing'
	)
);
