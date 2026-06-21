# Spec: 09-export

**Goal:** Export a manual to HTML and PDF.
**Package/app(s):** `packages/export`, `apps/engine`, `apps/web`.
**Depends on:** 01-core, 07-engine-worker, 08-web-editor (export gate preconditions).

> **Bootstrap** ships keyframe-based export. **Target** (client alignment): schematic IKEA/LEGO layout
> using `illustrationUrl` + `caption` — no separate spec 18. See
> [client alignment assessment](../docs/ai/client-alignment-assessment.md).

## Inputs

- A manual eligible for export: all steps `reviewStatus: confirmed`, no open
  `PartRef.candidateBomItemIds` (spec 08).
- Env: `SUPABASE_SERVICE_ROLE_KEY` (engine writes the PDF to Storage).

## Outputs

- Standalone HTML rendering the manual.
- A downloadable PDF stored in Supabase Storage.

## In scope

- An HTML template that renders an `InstructionManual`.
- A SvelteKit route that serves the HTML and enqueues an `export` job.
- The engine's `export` handler renders the HTML to PDF with Playwright and stores it in Storage.
- The web app offers the download when the PDF is ready.
- **Reject** export jobs that fail the gate (unconfirmed steps or unresolved BOM candidates).

**Bootstrap (current milestone):** template uses `keyframeUrl` per step.

**Target (phase 1):** template uses `illustrationUrl` as primary image and `caption` for on-page text;
`keyframeUrl` optional in appendix/debug only.

## Out of scope

- Re-running the full process pipeline during export.
- Compositor-full per-step CAD renders (spec 14 tier 2).

## Acceptance criteria

- A gate-satisfied manual produces valid standalone HTML and a downloadable PDF.
- Export is rejected when gate rules fail, with a clear error to the web app.
- **Target:** PDF uses schematic illustrations, not raw video keyframes.

## Validation

- `pnpm --filter @vitruvius/export typecheck`
- `pnpm --filter @vitruvius/export lint`
- `pnpm --filter @vitruvius/engine build`
- Integration: enqueue an `export` job and download the resulting PDF.
