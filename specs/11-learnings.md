# Spec: 11-learnings

**Goal:** Capture reusable domain knowledge from a run and feed it back into future runs (meta-learning).
**Package/app(s):** `packages/ai`, `packages/db` (+ a small contract addition in `packages/core`).
**Depends on:** 01-core, 02-db, 06-ai-instructions.

> Closes the loop: generate → critique → human-correct → learn → generate better and cheaper.
> See [`docs/ai/ai-layer.md`](../docs/ai/ai-layer.md) ("Meta-learning") and decision 10 in
> [`docs/ai/decisions.md`](../docs/ai/decisions.md). Only knowledge serving the core scope earns a place.

## Inputs

- A finished run's `ManualStep[]` and/or confirmed/corrected steps from the editor (spec 08) — the
  human edit is the highest-quality signal.
- Env: `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## Outputs

- `Learning` rows persisted via `@vitruvius/db`: durable, generalizable heuristics (not per-video
  transcripts) — e.g. tool/part conventions, audio cues, recurring warnings.
- A retrieval helper that returns relevant learnings to prime the Segmenter/Instructor prompts.

## In scope

- Define a `Learning` type + zod schema in `@vitruvius/core` (the contract bump is part of this spec):
  at least `id`, `scope`/tag, `text`, `sourceManualId`, `createdAt`.
- A `learnings` table + queries in `packages/db` (write + relevance retrieval).
- A `distillLearnings(...)` agent in `packages/ai` that extracts only reusable, generalizable facts.
- A `relevantLearnings(...)` retrieval used to inject learnings into generation prompts (spec 05/06),
  which both improves accuracy and reduces credits.

## Out of scope

- Fine-tuning or training custom models (this is prompt-level priming only).
- Cross-tenant sharing of learnings (a self-host/BYO concern; future, see `docs/ai/ai-layer.md`).
- A management UI for learnings.

## Acceptance criteria

- A run can write at least one schema-valid `Learning`, scoped to the core domain, retrievable later.
- Retrieval returns relevant learnings for a new run, and they are demonstrably injected into a
  generation prompt.
- Per-video noise is rejected: only reusable heuristics are stored (a transcript line is not a learning).

## Validation

- `pnpm --filter @vitruvius/core typecheck` (contract addition)
- `pnpm --filter @vitruvius/db typecheck`
- `pnpm --filter @vitruvius/ai typecheck`
- `pnpm --filter @vitruvius/ai lint`
- `pnpm --filter @vitruvius/ai test` (distill keeps reusable facts, drops per-video noise; retrieval returns relevant rows)
