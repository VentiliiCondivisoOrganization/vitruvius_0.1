# Spec: 09-export

**Goal:** Export a manual to HTML and PDF.
**Package/app(s):** `packages/export`, `apps/engine`, `apps/web`.
**Depends on:** 01-core, 07-engine-worker.

## Inputs
- A `ready` `InstructionManual`.
- Env: `SUPABASE_SERVICE_ROLE_KEY` (engine writes the PDF to Storage).

## Outputs
- Standalone HTML rendering the manual (original keyframes first).
- A downloadable PDF stored in Supabase Storage.

## In scope
- An HTML template that renders an `InstructionManual` (original keyframes first).
- A SvelteKit route that serves the HTML and enqueues an `export` job.
- The engine's `export` handler renders the HTML to PDF with Playwright and stores it in Storage.
- The web app offers the download when the PDF is ready.

## Out of scope
- Schematic / illustrated rendering.
- Re-running the AI pipeline.

## Acceptance criteria
- A `ready` manual produces valid standalone HTML.
- The same manual produces a downloadable PDF.

## Validation
- `pnpm --filter @vitruvius/export typecheck`
- `pnpm --filter @vitruvius/export lint`
- `pnpm --filter @vitruvius/engine build`
- Integration: enqueue an `export` job and download the resulting PDF.
