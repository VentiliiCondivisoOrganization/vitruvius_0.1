# Spec: 08-web-editor

**Goal:** The guided human revision editor (the "Editor di revisione avanzato").
**Package/app(s):** `apps/web`, `packages/db`.
**Depends on:** 02-db.

> Client-alignment extensions (disambiguazione BOM, regenerate enqueue, export gate) are **in scope
> for this spec** — not a separate spec 15. See
> [client alignment assessment](../docs/ai/client-alignment-assessment.md).

## Inputs

- A `ready` (or in-progress) `InstructionManual` loaded via `@vitruvius/db`.

## Outputs

- Persisted edits to steps, with `reviewStatus` set to `edited` / `confirmed`.

## In scope

- A SvelteKit steps list + step editor supporting: edit a step, split/merge steps, correct
  components/tools, add quality checks, add warnings, handle missing info, and choose among
  `alternatives`.
- Surface each step's `confidence`, `reviewStatus`, and `sourceNotes` (the Critic, spec 10,
  recalibrates `confidence` and may add `critique` flags upstream — surface those if present).
- Persist edits and update `reviewStatus`. Confirmed/corrected edits are the highest-quality signal
  for the learnings store (spec 11), though distillation itself runs in the engine, not here.

**Target (client alignment):**

- **BOM disambiguation:** when `PartRef.candidateBomItemIds` is set, require the user to pick one
  option before export — same UX pattern as choosing among `alternatives`.
- **Prompt regeneration:** enqueue `regenerate` jobs (spec 16) with scope `text` | `illustration` |
  `layout` | `structure` — engine runs Instructor / Illustrator, not the web app.
- **Export readiness:** surface blocking issues (unconfirmed steps, open BOM candidates) before the
  user can enqueue export (spec 09 gate).

## Out of scope

- Running AI inside the web app (all regeneration via engine jobs).
- Export rendering (spec 09) — but export **gate preconditions** are coordinated here.

## Acceptance criteria

- A user can fully edit a generated manual.
- Changes persist across reloads.
- `reviewStatus` reflects edited / confirmed steps.
- **Target:** unresolved `candidateBomItemIds` block export; resolved choice persists on reload.

## Validation

- `pnpm --filter @vitruvius/web typecheck`
- `pnpm --filter @vitruvius/web lint`
- `pnpm --filter @vitruvius/web build`
- Manual run: edit a generated manual, reload, confirm persistence.
