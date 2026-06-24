# Spec: 16-regenerate-job

**Goal:** Let the editor request AI updates via natural-language prompt by enqueueing a `regenerate` job — reusing existing agents, not a new “Regenerator” persona.
**Package/app(s):** `apps/web`, `apps/engine`, `packages/db`, `packages/ai`.
**Depends on:** 02-db, 06-ai-instructions, 14-ai-illustrate (for illustration/layout scopes).

> Design source: [client alignment assessment](../docs/ai/client-alignment-assessment.md) §5.2.
> Extends spec 08 (today: AI re-generation is out of scope).

> **Status: implemented.** `text` / `illustration` / `layout` shipped in #41. The `structure`
> scope is wired engine-side as a deterministic split/merge of the selected step(s) (mirroring the
> editor's spec-08 split/merge) followed by an Instructor re-run — see
> `apps/engine/src/regenerate.ts` (`restructureSteps`), covered by `apps/engine/src/regenerate.test.ts`.
> The optional AI **re-segmentation** from the source video ("re-segment only when explicitly
> requested", below) is intentionally not built yet — a future opt-in, not a divergence.

## Inputs

- A manual in revision (spec 08) with step id(s) and user prompt.
- Scope: `text` | `illustration` | `layout` | `structure` (structure may invoke editor split/merge + optional re-segment — expensive, opt-in).
- Env: same as process job (`GEMINI_API_KEY`, etc.).

## Outputs

- Updated step(s) persisted via `@vitruvius/db`; `reviewStatus` reset toward `edited` / requires re-confirm.
- Credit spend attributed to the manual.

## In scope

- Extend `@vitruvius/core`: `JOB_TYPE` includes `regenerate` (breaking change with contract bump).
- Web: UI to submit prompt + scope; enqueue job row.
- Engine: claim `regenerate` job; dispatch:
  - `text` → Instructor (subset of steps)
  - `illustration` / `layout` → Illustrator or Compositor (spec 14)
  - `structure` → coordinate with editor operations; re-segment only when explicitly requested
- Preserve `sourceNotes` provenance where fields are not regenerated.

## Out of scope

- A standalone `Regenerator` agent with its own prompt roster (use existing interfaces).
- Regeneration from the web app calling AI directly (engine only).
- Automatic regeneration without user prompt.

## Acceptance criteria

- Enqueueing `regenerate` with scope `text` updates `instruction`/`caption` for selected steps.
- Scope `illustration` updates `illustrationUrl` via spec 14 agents.
- Failed jobs surface on the manual/job row; no silent partial writes.

## Validation

- `pnpm --filter @vitruvius/core typecheck`
- `pnpm --filter @vitruvius/web typecheck`
- `pnpm --filter @vitruvius/engine build`
- Integration: prompt regen on a fixture manual updates the targeted field(s)
