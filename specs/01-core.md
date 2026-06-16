# Spec: 01-core

**Goal:** Define and freeze the shared contract that every other package imports.
**Package/app(s):** `packages/core`.
**Depends on:** none.

> **Status: already satisfied by the bootstrap.** The contract was created during scaffolding.
> This spec is "verify, document, and freeze" — no further implementation should be needed.

## Inputs
None (this package has no runtime inputs; it is pure types + schemas + enums).

## Outputs
- Enums/const arrays: `MANUAL_STATUS`, `STEP_REVIEW_STATUS`, `JOB_STATUS`, `JOB_TYPE`.
- Types: `ManualStep`, `InstructionManual`, `Job` (+ the derived status types).
- Zod schemas: `manualStepSchema`, `instructionManualSchema`, `jobSchema`.

## In scope
- The types, zod schemas, and enums as scaffolded.
- Documenting these shapes as the single source of truth.

## Out of scope
- Any runtime logic, I/O, or dependencies beyond `zod`.
- Letting any other package redefine these shapes locally.

## Acceptance criteria
- `@vitruvius/core` builds and typechecks.
- The zod schemas parse valid fixtures and reject invalid ones.
- No other package declares its own copy of `ManualStep` / `InstructionManual` / `Job`.

## Validation
- `pnpm --filter @vitruvius/core typecheck`
- `pnpm --filter @vitruvius/core build`
- `pnpm --filter @vitruvius/core lint`
