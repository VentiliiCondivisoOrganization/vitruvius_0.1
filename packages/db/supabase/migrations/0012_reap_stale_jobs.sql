-- Spec 07-engine (follow-up) — reap abandoned `running` jobs.
--
-- The engine worker is single-threaded and a long stage (notably `media`: download a
-- multi-GB source video, then ffmpeg scene detection + keyframe extraction) writes nothing
-- to the job row while it runs. So "running for a while" cannot by itself mean "dead" — a
-- naive timeout would requeue a perfectly healthy long job. The worker therefore heartbeats
-- the job row (a no-op UPDATE that bumps updated_at via the jobs_set_updated_at trigger)
-- while it works; a job whose updated_at is older than the lease has missed every heartbeat
-- and is presumed abandoned (worker crashed / OOM-killed / machine restarted).
--
-- reap_stale_jobs requeues such jobs for another attempt, or — once attempts reach the cap —
-- fails them and marks their manual `failed`, so the web retry/delete affordances (which key
-- off `failed`) apply instead of the manual hanging in `processing` forever. Idempotent and
-- concurrency-safe (FOR UPDATE SKIP LOCKED); safe to call from every worker tick.
CREATE OR REPLACE FUNCTION reap_stale_jobs (p_lease INTERVAL, p_max_attempts INTEGER) returns setof jobs language plpgsql AS $$
begin
  -- Mark the manual failed for jobs that have exhausted their attempts, before the job row
  -- flips out of 'running' below. Requeued jobs leave the manual as-is (it re-enters the
  -- pipeline, which re-sets it 'processing').
  update manuals m
     set status = 'failed'
    from jobs j
   where j.manual_id = m.id
     and j.status = 'running'
     and j.updated_at < now() - p_lease
     and j.attempts >= p_max_attempts;

  return query
  update jobs
     set status = case when attempts >= p_max_attempts then 'failed' else 'queued' end,
         last_error = case when attempts >= p_max_attempts
                           then 'reaped: no heartbeat for ' || p_lease::text
                           else last_error end
   where id in (
     select id
       from jobs
      where status = 'running'
        and updated_at < now() - p_lease
      for update skip locked
   )
  returning *;
end;
$$;
