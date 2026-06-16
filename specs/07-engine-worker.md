# Spec: 07-engine-worker

**Goal:** The engine claims `process` jobs and runs the full pipeline.
**Package/app(s):** `apps/engine`, `packages/db`, `packages/media`, `packages/ai`.
**Depends on:** 02-db, 04-media, 05-ai-segment, 06-ai-instructions.

## Inputs
- A queued `process` job (claimed via `@vitruvius/db`).
- Env: `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `ENGINE_POLL_INTERVAL_MS`.

## Outputs
- A populated `InstructionManual` saved via `@vitruvius/db`.
- Updated `manuals.status` (`processing` → `ready` / `failed`) and job status.

## In scope
- The poll loop claims a `process` job.
- Run media → ai-segment → ai-instructions.
- Save the manual via db; set `manuals.status` and the job status.
- Retry / attempt handling on failure.

## Out of scope
- The editor (spec 08).
- The export job (spec 09).

## Acceptance criteria
- Enqueuing a `process` job moves the manual to `ready` with populated steps.
- Failures are recorded (job `failed`, manual `failed`), not silent.

## Validation
- `pnpm --filter @vitruvius/engine typecheck`
- `pnpm --filter @vitruvius/engine lint`
- `pnpm --filter @vitruvius/engine build`
- Integration: enqueue a `process` job and observe the manual reach `ready`.
