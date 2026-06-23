-- Spec 16-regenerate-job — add the `regenerate` job type and a per-job payload.
--
-- Keeps the jobs.type CHECK in sync with @vitruvius/core JOB_TYPE (now
-- process | export | regenerate) and adds a nullable jsonb `payload` carrying the
-- regenerate request (scope, prompt, stepIds). process/export jobs leave it null;
-- the core zod schema (regenerateRequestSchema) re-validates the payload at the app
-- boundary, so this column stays loosely typed (jsonb) here.
ALTER TABLE jobs
DROP CONSTRAINT jobs_type_check;

ALTER TABLE jobs
ADD CONSTRAINT jobs_type_check CHECK (type IN ('process', 'export', 'regenerate'));

ALTER TABLE jobs
ADD COLUMN payload jsonb;
