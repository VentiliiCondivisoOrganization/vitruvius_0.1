-- Spec 08-web-editor / spec 10-critic — persist the Critic's `critique` flags.
--
-- The @vitruvius/core ManualStep contract carries a `critique: string[]` field
-- (Critic flags: what is unsupported/missing, empty when well-supported). The
-- initial schema (0001) predates that field, so critique was computed by the AI
-- layer but dropped on the way to the database. Add the column and teach
-- save_manual to write it, so critique round-trips and the editor can surface it.
-- ---------------------------------------------------------------------------
ALTER TABLE steps
ADD COLUMN critique TEXT[] NOT NULL DEFAULT '{}';

-- Rewrite save_manual to also persist critique. Body is identical to 0001 except
-- for the added column in the steps insert.
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
      source_notes, alternatives, critique
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
      coalesce((select array_agg(value) from jsonb_array_elements_text(v_step->'alternatives')), '{}'),
      coalesce((select array_agg(value) from jsonb_array_elements_text(v_step->'critique')), '{}')
    );
  end loop;
end;
$$;
