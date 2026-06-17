-- Spec 02-db — schema for manuals, steps, and the jobs queue.
--
-- Shapes mirror @vitruvius/core (InstructionManual / ManualStep / Job). The CHECK
-- constraints below MUST stay in sync with the core const arrays:
--   MANUAL_STATUS      = uploaded | processing | ready | failed
--   STEP_REVIEW_STATUS = hypothesis | confirmed | edited
--   JOB_STATUS         = queued | running | done | failed
--   JOB_TYPE           = process | export
-- Enforcement at the app boundary is the core zod schemas (see src/mappers.ts);
-- these constraints are a defense-in-depth backstop at the database.
-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE manuals (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	title text NOT NULL,
	video_url text NOT NULL,
	status text NOT NULL DEFAULT 'uploaded' CHECK (
		status IN ('uploaded', 'processing', 'ready', 'failed')
	),
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE steps (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	manual_id uuid NOT NULL REFERENCES manuals (id) ON DELETE CASCADE,
	"order" integer NOT NULL,
	title text NOT NULL,
	instruction text NOT NULL,
	start_ms integer NOT NULL CHECK (start_ms >= 0),
	end_ms integer NOT NULL CHECK (end_ms >= 0),
	keyframe_url text NOT NULL,
	tools TEXT[] NOT NULL DEFAULT '{}',
	parts TEXT[] NOT NULL DEFAULT '{}',
	warnings TEXT[] NOT NULL DEFAULT '{}',
	confidence real NOT NULL CHECK (
		confidence >= 0
		AND confidence <= 1
	),
	review_status text NOT NULL CHECK (
		review_status IN ('hypothesis', 'confirmed', 'edited')
	),
	source_notes TEXT[] NOT NULL DEFAULT '{}',
	alternatives TEXT[] NOT NULL DEFAULT '{}',
	UNIQUE (manual_id, "order")
);

CREATE INDEX steps_manual_id_order_idx ON steps (manual_id, "order");

CREATE TABLE jobs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	manual_id uuid NOT NULL REFERENCES manuals (id) ON DELETE CASCADE,
	type text NOT NULL CHECK (type IN ('process', 'export')),
	status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
	attempts integer NOT NULL DEFAULT 0,
	last_error text, -- operational only; not part of the Job contract
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

-- The hot path for claim_next_job: oldest queued job of a given type. Keying on
-- (status, type, created_at) lets a worker claiming a subset of types seek
-- straight to matching rows instead of scanning queued rows of other types.
CREATE INDEX jobs_claim_idx ON jobs (status, type, created_at);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at () returns trigger language plpgsql AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

CREATE TRIGGER manuals_set_updated_at
BEFORE UPDATE ON manuals FOR EACH ROW
EXECUTE FUNCTION set_updated_at ();

CREATE TRIGGER jobs_set_updated_at
BEFORE UPDATE ON jobs FOR EACH ROW
EXECUTE FUNCTION set_updated_at ();

-- ---------------------------------------------------------------------------
-- claim_next_job — atomic, concurrency-safe dequeue.
--
-- PostgREST/supabase-js cannot issue `FOR UPDATE SKIP LOCKED`, so the queue's
-- claim lives here and is called via .rpc('claim_next_job'). Multiple engine
-- instances can call this concurrently and will never claim the same row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_next_job (p_types TEXT[]) returns setof jobs language plpgsql AS $$
begin
  return query
  update jobs
     set status = 'running',
         attempts = attempts + 1,
         updated_at = now()
   where id = (
     select id
       from jobs
      where status = 'queued'
        and type = any (p_types)
      order by created_at
      for update skip locked
      limit 1
   )
  returning *;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_manual — upsert a manual and replace its steps in one transaction.
--
-- Takes the full InstructionManual as jsonb (camelCase, as serialized by the
-- core type). Atomic: a partially-written manual is never visible.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION save_manual (p_manual jsonb) returns void language plpgsql AS $$
declare
  v_manual_id uuid := (p_manual->>'id')::uuid;
  v_step      jsonb;
begin
  insert into manuals (id, title, video_url, status, created_at, updated_at)
  values (
    v_manual_id,
    p_manual->>'title',
    p_manual->>'videoUrl',
    p_manual->>'status',
    coalesce((p_manual->>'createdAt')::timestamptz, now()),
    now()
  )
  on conflict (id) do update
     set title = excluded.title,
         video_url = excluded.video_url,
         status = excluded.status,
         updated_at = now();

  -- Replace the full step set; the manual row is the unit of truth.
  delete from steps where manual_id = v_manual_id;

  for v_step in select * from jsonb_array_elements(coalesce(p_manual->'steps', '[]'::jsonb))
  loop
    insert into steps (
      id, manual_id, "order", title, instruction, start_ms, end_ms,
      keyframe_url, tools, parts, warnings, confidence, review_status,
      source_notes, alternatives
    )
    values (
      (v_step->>'id')::uuid,
      v_manual_id,
      (v_step->>'order')::integer,
      v_step->>'title',
      v_step->>'instruction',
      (v_step->>'startMs')::integer,
      (v_step->>'endMs')::integer,
      v_step->>'keyframeUrl',
      coalesce((select array_agg(value) from jsonb_array_elements_text(v_step->'tools')), '{}'),
      coalesce((select array_agg(value) from jsonb_array_elements_text(v_step->'parts')), '{}'),
      coalesce((select array_agg(value) from jsonb_array_elements_text(v_step->'warnings')), '{}'),
      (v_step->>'confidence')::real,
      v_step->>'reviewStatus',
      coalesce((select array_agg(value) from jsonb_array_elements_text(v_step->'sourceNotes')), '{}'),
      coalesce((select array_agg(value) from jsonb_array_elements_text(v_step->'alternatives')), '{}')
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Enabled now so tables are never world-open on a hosted project. The engine
-- uses the service-role key, which bypasses RLS entirely. User-facing policies
-- (for the anon/auth web client) land with the web/auth spec.
-- ---------------------------------------------------------------------------
ALTER TABLE manuals enable ROW level security;

ALTER TABLE steps enable ROW level security;

ALTER TABLE jobs enable ROW level security;

-- The engine connects as service_role (BYPASSRLS), but still needs table-level
-- privileges, which Supabase's default grants don't extend to migration-created
-- tables. Grant them explicitly. Anon/authenticated grants + RLS policies for the
-- web client land with the web/auth spec.
GRANT
SELECT
,
	insert,
UPDATE,
delete ON manuals,
steps,
jobs TO service_role;

GRANT
EXECUTE ON function claim_next_job (TEXT[]) TO service_role;

GRANT
EXECUTE ON function save_manual (jsonb) TO service_role;
