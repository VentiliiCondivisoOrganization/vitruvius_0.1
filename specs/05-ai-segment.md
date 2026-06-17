# Spec: 05-ai-segment

**Goal:** Turn a video / clips into segmented steps.
**Package/app(s):** `packages/ai`.
**Depends on:** 01-core, 04-media.

## Inputs

- A video URL / clips and media artifacts from `packages/media`.
- Env: `GEMINI_API_KEY`.

## Outputs

- `ManualStep[]` with `startMs` / `endMs`, `confidence`, and `sourceNotes` populated.

## In scope

- A Gemini call that returns `ManualStep[]` with time bounds, confidence, and source notes.
- Validate the model output with `manualStepSchema` from `@vitruvius/core`.
- Chunk long / fast sections so fast action sequences are not missed.
- **Credit discipline** (see [`docs/AI.md`](../docs/AI.md)): cheapest model that clears the bar;
  one structured call over per-segment round-trips; sub-chunk only fast/ambiguous sections; cache on
  a content hash of the media artifact + prompt version.
- Prime the prompt with relevant prior **learnings** (spec 11) when available — improves accuracy and
  reduces credits. Degrade gracefully when the store is empty.

## Out of scope

- Instruction wording / tools / parts / warnings (spec 06).
- Segmentation persistence (that is the engine's job, spec 07).

## Acceptance criteria

- Returns schema-valid steps for a sample video.
- Low-confidence segments are flagged via the `confidence` field.

## Validation

- `pnpm --filter @vitruvius/ai typecheck`
- `pnpm --filter @vitruvius/ai lint`
- `pnpm --filter @vitruvius/ai test` (schema-validate the output for a sample)
