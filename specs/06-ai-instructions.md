# Spec: 06-ai-instructions

**Goal:** Write per-step operative instructions.
**Package/app(s):** `packages/ai`.
**Depends on:** 01-core, 05-ai-segment.

## Inputs
- The segmented `ManualStep[]` from spec 05 (with `startMs`/`endMs`, `confidence`, `sourceNotes`).
- Env: `GEMINI_API_KEY`.

## Outputs
- Enriched `ManualStep[]` with `title`, `instruction`, `tools`, `parts`, `warnings`, and
  `alternatives` filled in — preserving `sourceNotes` and `confidence`.

## In scope
- A Gemini call that fills the operative fields per step.
- Preserve `sourceNotes` and `confidence` from segmentation.
- Validate output with `manualStepSchema` from `@vitruvius/core`.

## Out of scope
- Segmentation / time bounds (spec 05).
- Persistence and orchestration (spec 07).

## Acceptance criteria
- Schema-valid enriched steps.
- Every populated field is traceable to a source note.

## Validation
- `pnpm --filter @vitruvius/ai typecheck`
- `pnpm --filter @vitruvius/ai lint`
- `pnpm --filter @vitruvius/ai test`
