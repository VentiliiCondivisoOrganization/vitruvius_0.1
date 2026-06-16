import type { InstructionManual, Job, JobType } from "@vitruvius/core";

// TODO(spec 02-db): implement the Supabase client, typed CRUD queries, row⇄type
// mappers (validated with the @vitruvius/core zod schemas), and the Postgres-backed
// job queue helpers using `FOR UPDATE SKIP LOCKED`.

export async function getManual(_id: string): Promise<InstructionManual | null> {
  throw new Error("not implemented");
}

export async function saveManual(_manual: InstructionManual): Promise<void> {
  throw new Error("not implemented");
}

export async function enqueueJob(_input: { manualId: string; type: JobType }): Promise<Job> {
  throw new Error("not implemented");
}

export async function claimNextJob(): Promise<Job | null> {
  throw new Error("not implemented");
}

export async function completeJob(_id: string): Promise<void> {
  throw new Error("not implemented");
}

export async function failJob(_id: string, _reason: string): Promise<void> {
  throw new Error("not implemented");
}
