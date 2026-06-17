# Spec: 10-ai-critic

**Goal:** An independent, unbiased agent that reviews the drafted steps for accuracy and recalibrates confidence.
**Package/app(s):** `packages/ai` (+ a small contract addition in `packages/core`).
**Depends on:** 01-core, 06-ai-instructions.

> Decoupling is the point: the generator must not grade itself. See [`docs/ai/ai-layer.md`](../docs/ai/ai-layer.md)
> ("The Critic") and decision 9 in [`docs/ai/decisions.md`](../docs/ai/decisions.md). The spirit is a
> `/grill-me` reviewer — relentless and unbiased, but no busywork on well-supported steps.

## Inputs

- The enriched `ManualStep[]` from spec 06 (with `instruction`, `tools`, `parts`, `warnings`,
  `sourceNotes`, `confidence`).
- Env: `GEMINI_API_KEY` (the Critic may use a cheaper/different model than the generators).

## Outputs

- The same `ManualStep[]`, with `confidence` recalibrated and a new `critique` field per step
  describing what is unsupported or missing (empty when the step is well-supported).

## In scope

- A separate agent function (e.g. `critiqueSteps(steps): Promise<ManualStep[]>`) with its own prompt,
  distinct from the generators.
- For each step: judge whether the instruction is actually supported by its `sourceNotes`; lower
  `confidence` where it is not; populate `critique` with a concrete, actionable flag.
- Extend the contract (spec 01) in the same change: add `critique: string[]` to `ManualStep` /
  `manualStepSchema`. The contract bump is part of this spec.
- A cheap, text-only pass — the Critic does NOT re-watch the video.
- Validate output with `manualStepSchema` from `@vitruvius/core`.

## Out of scope

- Rewriting instructions (that is the Instructor, spec 06). The Critic only scores and flags.
- Expensive re-segmentation of flagged steps (a later, opt-in escalation; not the MVP).
- Editor UI for the critique field (the editor, spec 08, already surfaces `confidence`/`sourceNotes`).

## Acceptance criteria

- Returns schema-valid steps; `confidence` is adjusted relative to the input where evidence is weak.
- A step whose instruction is unsupported by its `sourceNotes` gets a non-empty `critique` and a
  lowered `confidence`; a well-supported step is left unflagged.
- The Critic uses a different prompt than the Instructor and never mutates `instruction` text.

## Validation

- `pnpm --filter @vitruvius/core typecheck` (contract addition)
- `pnpm --filter @vitruvius/ai typecheck`
- `pnpm --filter @vitruvius/ai lint`
- `pnpm --filter @vitruvius/ai test` (a well-supported fixture stays unflagged; an unsupported one is flagged + downgraded)
