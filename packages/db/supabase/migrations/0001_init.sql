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

create table manuals (
  id         uuid primary key default gen_random_uuid(),
  title      text        not null,
  video_url  text        not null,
  status     text        not null default 'uploaded'
               check (status in ('uploaded', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table steps (
  id            uuid primary key default gen_random_uuid(),
  manual_id     uuid    not null references manuals (id) on delete cascade,
  "order"       integer not null,
  title         text    not null,
  instruction   text    not null,
  start_ms      integer not null check (start_ms >= 0),
  end_ms        integer not null check (end_ms >= 0),
  keyframe_url  text    not null,
  tools         text[]  not null default '{}',
  parts         text[]  not null default '{}',
  warnings      text[]  not null default '{}',
  confidence    real    not null check (confidence >= 0 and confidence <= 1),
  review_status text    not null
                  check (review_status in ('hypothesis', 'confirmed', 'edited')),
  source_notes  text[]  not null default '{}',
  alternatives  text[]  not null default '{}',
  unique (manual_id, "order")
);

create index steps_manual_id_order_idx on steps (manual_id, "order");

create table jobs (
  id         uuid primary key default gen_random_uuid(),
  manual_id  uuid    not null references manuals (id) on delete cascade,
  type       text    not null check (type in ('process', 'export')),
  status     text    not null default 'queued'
               check (status in ('queued', 'running', 'done', 'failed')),
  attempts   integer not null default 0,
  last_error text,                                   -- operational only; not part of the Job contract
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The hot path for claim_next_job: find the oldest queued job of a given type.
create index jobs_claim_idx on jobs (status, created_at);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger manuals_set_updated_at
  before update on manuals
  for each row execute function set_updated_at();

create trigger jobs_set_updated_at
  before update on jobs
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- claim_next_job — atomic, concurrency-safe dequeue.
--
-- PostgREST/supabase-js cannot issue `FOR UPDATE SKIP LOCKED`, so the queue's
-- claim lives here and is called via .rpc('claim_next_job'). Multiple engine
-- instances can call this concurrently and will never claim the same row.
-- ---------------------------------------------------------------------------

create or replace function claim_next_job(p_types text[])
returns setof jobs
language plpgsql
as $$
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

create or replace function save_manual(p_manual jsonb)
returns void
language plpgsql
as $$
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

alter table manuals enable row level security;
alter table steps   enable row level security;
alter table jobs    enable row level security;

-- The engine connects as service_role (BYPASSRLS), but still needs table-level
-- privileges, which Supabase's default grants don't extend to migration-created
-- tables. Grant them explicitly. Anon/authenticated grants + RLS policies for the
-- web client land with the web/auth spec.
grant select, insert, update, delete on manuals, steps, jobs to service_role;
grant execute on function claim_next_job(text[]) to service_role;
grant execute on function save_manual(jsonb)      to service_role;
