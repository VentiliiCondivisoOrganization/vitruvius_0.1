-- Spec 13-bom-map / spec 03 extension — optional BOM file and digital model storage keys.
-- ---------------------------------------------------------------------------
ALTER TABLE manuals
ADD COLUMN bom_file_url text NOT NULL DEFAULT '',
ADD COLUMN digital_model_url text NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION save_manual (p_manual jsonb) returns void language plpgsql AS $$
declare
  v_manual_id uuid := (p_manual->>'id')::uuid;
  v_step      jsonb;
begin
  insert into manuals (
    id, title, video_url, bom_file_url, digital_model_url, status, bom, created_at, updated_at
  )
  values (
    v_manual_id,
    p_manual->>'title',
    p_manual->>'videoUrl',
    coalesce(p_manual->>'bomFileUrl', ''),
    coalesce(p_manual->>'digitalModelUrl', ''),
    p_manual->>'status',
    coalesce(p_manual->'bom', '[]'::jsonb),
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
