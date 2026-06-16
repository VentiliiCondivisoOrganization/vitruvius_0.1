# Spec: 08-web-editor

**Goal:** The guided human revision editor (the "Editor di revisione avanzato").
**Package/app(s):** `apps/web`, `packages/db`.
**Depends on:** 02-db.

## Inputs
- A `ready` (or in-progress) `InstructionManual` loaded via `@vitruvius/db`.

## Outputs
- Persisted edits to steps, with `reviewStatus` set to `edited` / `confirmed`.

## In scope
- A SvelteKit steps list + step editor supporting: edit a step, split/merge steps, correct
  components/tools, add quality checks, add warnings, handle missing info, and choose among
  `alternatives`.
- Surface each step's `confidence`, `reviewStatus`, and `sourceNotes`.
- Persist edits and update `reviewStatus`.

## Out of scope
- AI re-generation.
- Export (spec 09).

## Acceptance criteria
- A user can fully edit a generated manual.
- Changes persist across reloads.
- `reviewStatus` reflects edited / confirmed steps.

## Validation
- `pnpm --filter @vitruvius/web typecheck`
- `pnpm --filter @vitruvius/web lint`
- `pnpm --filter @vitruvius/web build`
- Manual run: edit a generated manual, reload, confirm persistence.
