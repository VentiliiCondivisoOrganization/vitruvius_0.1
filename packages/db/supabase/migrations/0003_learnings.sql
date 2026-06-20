-- Spec 11-learnings — durable, reusable heuristics distilled from finished runs.
--
-- Shape mirrors @vitruvius/core (Learning). A learning is a generalizable fact
-- (tool/part convention, audio cue, recurring warning) — NOT a per-video transcript
-- line. Rows are primed back into future generation prompts (see relevantLearnings).
-- Enforcement at the app boundary is the core zod schema (see src/mappers.ts); the
-- constraints here are a defense-in-depth backstop.
-- ---------------------------------------------------------------------------
CREATE TABLE learnings (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	scope text NOT NULL CHECK (length(scope) > 0),
	text text NOT NULL CHECK (length(text) > 0),
	-- The run this was distilled from. Cascades on delete: rolling back a manual
	-- removes the learnings it produced.
	source_manual_id uuid NOT NULL REFERENCES manuals (id) ON DELETE CASCADE,
	created_at timestamptz NOT NULL DEFAULT now()
);

-- Retrieval hot path: most-recent learnings within a scope (relevantLearnings).
CREATE INDEX learnings_scope_created_at_idx ON learnings (scope, created_at DESC);

ALTER TABLE learnings enable ROW level security;

-- The engine connects as service_role (BYPASSRLS) but still needs table-level
-- privileges. Anon/authenticated grants land with the web/auth spec.
GRANT
SELECT
,
	insert,
UPDATE,
delete ON learnings TO service_role;
