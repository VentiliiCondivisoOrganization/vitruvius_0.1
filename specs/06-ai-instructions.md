# Spec: 06-ai-instructions

**Goal:** Write per-step operative instructions.
**Package/app(s):** `packages/ai`.
**Depends on:** 01-core, 05-ai-segment, 13-bom-map (when `PartRef[]` lands).

## Inputs

- The segmented `ManualStep[]` from spec 05 (with `startMs`/`endMs`, `confidence`, `sourceNotes`).
- Env: `GEMINI_API_KEY`.

## Outputs

- Enriched `ManualStep[]` with `title`, `instruction`, `tools`, `parts`, `warnings`, and
  `alternatives` filled in — preserving `sourceNotes` and `confidence`.

**Target (client alignment):** also `caption` (short text for export) and `parts: PartRef[]` from spec 13;
prime with `DigitalModel` when spec 12 present.

## In scope

- A Gemini call that fills the operative fields per step.
- Preserve `sourceNotes` and `confidence` from segmentation (the **Critic**, spec 10, depends on
  `sourceNotes` to judge whether each instruction is actually supported).
- Validate output with `manualStepSchema` from `@vitruvius/core`.
- **Credit discipline** (see [`docs/ai/ai-layer.md`](../docs/ai/ai-layer.md)): fill all steps in one structured call
  rather than per-step round-trips; cache on a content hash of the input + prompt version.
- Prime the prompt with relevant prior **learnings** (spec 11) when available.

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
