import type { Job } from "@vitruvius/core";

// TODO(spec 07-engine-worker): claim a `process` job and run the full pipeline —
// packages/media (ffmpeg) → packages/ai (segment) → packages/ai (instructions) →
// save the manual via packages/db, moving manuals.status processing → ready/failed.
export async function handleProcessJob(_job: Job): Promise<void> {
  throw new Error("not implemented");
}
