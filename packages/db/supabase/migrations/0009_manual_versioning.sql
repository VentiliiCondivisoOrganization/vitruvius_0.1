-- Spec 17-manual-versioning — incremental enrichment makes a new manual version on the
-- SAME step timeline (v1 -> v2) when BOM/CAD is added after a video-only run.
--
-- Adds version + parent lineage to manuals and the `enrich` job type (kept in sync with
-- @vitruvius/core JOB_TYPE: process | export | regenerate | enrich). `save_manual` is
-- extended to persist the new columns. v1 is version 1 with a null parent.
ALTER TABLE manuals
ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
ADD COLUMN parent_version_id uuid REFERENCES manuals (id) ON DELETE SET NULL;

CREATE INDEX manuals_parent_version_id_idx ON manuals (parent_version_id);

ALTER TABLE jobs
DROP CONSTRAINT jobs_type_check;

ALTER TABLE jobs
ADD CONSTRAINT jobs_type_check CHECK (
	type IN ('process', 'export', 'regenerate', 'enrich')
);

-- Extend save_manual to persist version + parent lineage (otherwise a v2 upsert would
-- silently fall back to the version 1 default).
CREATE OR REPLACE FUNCTION save_manual (p_manual jsonb) returns void language plpgsql AS $$
declare
  v_manual_id uuid := (p_manual->>'id')::uuid;
  v_step      jsonb;
begin
  insert into manuals (
    id, title, video_url, bom_file_url, digital_model_url, status, bom,
    version, parent_version_id, created_at, updated_at
  )
  values (
    v_manual_id,
    p_manual->>'title',
    p_manual->>'videoUrl',
    coalesce(p_manual->>'bomFileUrl', ''),
    coalesce(p_manual->>'digitalModelUrl', ''),
    p_manual->>'status',
    coalesce(p_manual->'bom', '[]'::jsonb),
    coalesce((p_manual->>'version')::integer, 1),
    (p_manual->>'parentVersionId')::uuid,
    coalesce((p_manual->>'createdAt')::timestamptz, now()),
    now()
  )
  on conflict (id) do update
     set title = excluded.title,
         video_url = excluded.video_url,
         bom_file_url = excluded.bom_file_url,
         digital_model_url = excluded.digital_model_url,
         status = excluded.status,
         bom = excluded.bom,
         version = excluded.version,
         parent_version_id = excluded.parent_version_id,
         updated_at = now();

  delete from steps where manual_id = v_manual_id;

  for v_step in select * from jsonb_array_elements(coalesce(p_manual->'steps', '[]'::jsonb))
  loop
    insert into steps (
      id, manual_id, "order", title, instruction, caption, start_ms, end_ms,
      keyframe_url, illustration_url, tools, part_refs, warnings, confidence,
      review_status, source_notes, alternatives, critique
    )
    values (
      (v_step->>'id')::uuid,
      v_manual_id,
      (v_step->>'order')::integer,
      v_step->>'title',
      v_step->>'instruction',
      coalesce(v_step->>'caption', ''),
      (v_step->>'startMs')::integer,
      (v_step->>'endMs')::integer,
      v_step->>'keyframeUrl',
      coalesce(v_step->>'illustrationUrl', ''),
      coalesce((select array_agg(value) from jsonb_array_elements_text(v_step->'tools')), '{}'),
      coalesce(v_step->'parts', '[]'::jsonb),
      coalesce((select array_agg(value) from jsonb_array_elements_text(v_step->'warnings')), '{}'),
      (v_step->>'confidence')::real,
      v_step->>'reviewStatus',
      coalesce((select array_agg(value) from jsonb_array_elements_text(v_step->'sourceNotes')), '{}'),
      coalesce((select array_agg(value) from jsonb_array_elements_text(v_step->'alternatives')), '{}'),
      coalesce((select array_agg(value) from jsonb_array_elements_text(v_step->'critique')), '{}')
    );
  end loop;
end;
$$;
