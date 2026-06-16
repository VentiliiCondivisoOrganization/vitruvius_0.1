import { claimNextJob, completeJob, failJob } from "@vitruvius/db";
import type { Job } from "@vitruvius/core";
import { handleProcessJob } from "./process.js";
import { handleExportJob } from "./export.js";

const POLL_INTERVAL_MS = Number(process.env.ENGINE_POLL_INTERVAL_MS ?? 2000);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dispatch(job: Job): Promise<void> {
  switch (job.type) {
    case "process":
      await handleProcessJob(job);
      return;
    case "export":
      await handleExportJob(job);
      return;
  }
}

async function tick(): Promise<void> {
  const job = await claimNextJob();
  if (!job) return;

  try {
    await dispatch(job);
    await completeJob(job.id);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[engine] job ${job.id} (${job.type}) failed: ${reason}`);
    await failJob(job.id, reason);
  }
}

async function main(): Promise<void> {
  console.log(`[engine] worker started; polling every ${POLL_INTERVAL_MS}ms`);
  for (;;) {
    try {
      await tick();
    } catch (error) {
      // A failure to even claim a job (e.g. DB unavailable) must not kill the loop.
      console.error("[engine] poll tick error:", error);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

void main();
