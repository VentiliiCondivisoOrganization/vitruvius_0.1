import { JOB_TYPE, type Job, type JobType } from "@vitruvius/core";
import type { DbClient } from "./client.js";
import { rowToJob } from "./mappers.js";
import type { JobRow } from "./types.js";

export async function enqueueJob(
  client: DbClient,
  input: { manualId: string; type: JobType },
): Promise<Job> {
  const { data, error } = await client
    .from("jobs")
    .insert({ manual_id: input.manualId, type: input.type })
    .select("*")
    .single<JobRow>();

  if (error) throw new Error(`enqueueJob: ${error.message}`);
  return rowToJob(data);
}

// Atomically claim the oldest queued job of one of the given types (defaults to
// all types). Returns null when the queue is empty. Safe to call concurrently
// from multiple engine instances — see the claim_next_job SQL function.
export async function claimNextJob(
  client: DbClient,
  types: readonly JobType[] = JOB_TYPE,
): Promise<Job | null> {
  const { data, error } = await client.rpc("claim_next_job", { p_types: [...types] });

  if (error) throw new Error(`claimNextJob: ${error.message}`);

  // The rpc is untyped (no generated Database type); the function returns 0..1
  // job rows. rowToJob validates the shape against the core schema.
  const rows = (data ?? []) as JobRow[];
  const row = rows[0];
  return row ? rowToJob(row) : null;
}

export async function completeJob(client: DbClient, id: string): Promise<void> {
  const { error } = await client.from("jobs").update({ status: "done" }).eq("id", id);
  if (error) throw new Error(`completeJob: ${error.message}`);
}

export async function failJob(client: DbClient, id: string, reason: string): Promise<void> {
  const { error } = await client
    .from("jobs")
    .update({ status: "failed", last_error: reason })
    .eq("id", id);
  if (error) throw new Error(`failJob: ${error.message}`);
}
