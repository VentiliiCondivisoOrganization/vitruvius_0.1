-- Spec 07 recovery — atomic retry of a failed manual.
--
-- The web retryManual helper used to do two separate round-trips (UPDATE manuals, then INSERT
-- jobs) with no transaction and no status guard. A crash between them could strand a manual in
-- `processing` with no queued job, and two concurrent retries could enqueue duplicate `process`
-- jobs. This wraps the whole transition in one function: it conditionally resets ONLY a `failed`
-- manual (clearing the stale progress_stage and the derived bom, and wiping any persisted steps
-- so the re-run starts clean), then enqueues a single fresh `process` job — all in one
-- transaction. The `WHERE status = 'failed'` row lock makes concurrent retries safe: the second
-- caller blocks, then sees `processing` and no-ops instead of enqueuing a duplicate.
--
-- SECURITY INVOKER (default): runs with the caller's privileges so RLS still enforces tenant
-- isolation — a user can only ever retry their own manual. Returns true when a retry was queued,
-- false when the manual was not `failed` (already retried, gone, or not owned/visible).
CREATE OR REPLACE FUNCTION retry_manual (p_manual_id uuid) returns boolean language plpgsql AS $$
declare
  v_updated integer;
begin
  update manuals
     set status = 'processing',
         progress_stage = null,
         bom = '[]'::jsonb,
         updated_at = now()
   where id = p_manual_id
     and status = 'failed';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return false;
  end if;

  -- Wipe any persisted output so the re-run starts from a clean slate (the pipeline normally
  -- saves nothing on failure, but this is defensive against a partially-written manual).
  delete from steps where manual_id = p_manual_id;

  insert into jobs (manual_id, type) values (p_manual_id, 'process');
  return true;
end;
$$;

GRANT
EXECUTE ON function retry_manual (uuid) TO authenticated;

GRANT
EXECUTE ON function retry_manual (uuid) TO service_role;
