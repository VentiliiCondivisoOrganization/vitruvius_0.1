# Spec: 01-core

**Goal:** Define and freeze the shared contract that every other package imports.
**Package/app(s):** `packages/core`.
**Depends on:** none.

> **Status: bootstrap satisfied** for the initial scaffold shapes. A **coordinated breaking change**
> (specs 10–12, 13–17) will extend the contract — see
> [client alignment assessment](../docs/ai/client-alignment-assessment.md) §5.1.

## Inputs

None (this package has no runtime inputs; it is pure types + schemas + enums).

## Outputs

- Enums/const arrays: `MANUAL_STATUS`, `STEP_REVIEW_STATUS`, `JOB_STATUS`, `JOB_TYPE`.
- Types: `ManualStep`, `InstructionManual`, `Job` (+ the derived status types).
- Zod schemas: `manualStepSchema`, `instructionManualSchema`, `jobSchema`.

**Planned extensions** (same PR family as specs 10–17):

- `ManualStep`: `critique[]`, `illustrationUrl`, `caption`, `parts: PartRef[]`, optional `keyframeUrl`
- `PartRef`: `candidateBomItemIds[]` (flat list)
- `ManualBomItem` + `InstructionManual.bom[]` (spec 13 reconcile; distinct from CAD `BomItem` in spec 12)
- `BomItem`, `DigitalModel`, `digitalModelStatus` (spec 12 — CAD priming)
- `Learning` (spec 11)
- `InstructionManual`: `version`, `parentVersionId` (spec 17)
- `JOB_TYPE`: add `regenerate` (spec 16)

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
