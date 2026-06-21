# Spec: 13-bom-map

**Goal:** Import an optional BOM file, reconcile it with `DigitalModel` (spec 12), and produce structured `PartRef[]` per step — deterministic match first, AI only for ambiguous rows.
**Package/app(s):** `packages/cad` (or dedicated engine-only module); extends `@vitruvius/core`; consumed by specs 06, 08, 09.
**Depends on:** 01-core, 05-ai-segment, 12-cad-ingest (peer). Feeds 06-ai-instructions, 08-web-editor.

> Design source: [client alignment assessment](../docs/ai/client-alignment-assessment.md) §5.2–5.3.
> This is a **hybrid layer**, not a duplicate Instructor agent.

## Inputs

- Segmented `ManualStep[]` from spec 05 (`sourceNotes`, time bounds).
- Optional `DigitalModel` from spec 12.
- Optional BOM file (CSV/Excel/ERP export) uploaded with the video (spec 03 extension).
- Optional audio-derived hints already captured in `sourceNotes` (spec 04 → 05).

## Outputs

- Enriched steps with `parts: PartRef[]` (`bomItemId`, `label`, `bomCode`, `description`, `confidence`, optional `candidateBomItemIds[]`).
- Merged `InstructionManual.bom: BomItem[]` with `partName` (CAD), `bomCode` (file), `source: 'cad' | 'file' | 'inferred'`.
- Deterministic pre-export flags when a part cannot be mapped or has unresolved candidates.

## In scope

- Parse common BOM file formats into `BomItem[]`.
- Reconcile file BOM with CAD-derived BOM when both exist (match keys, surface conflicts).
- **Deterministic match** segment evidence → BOM row when unambiguous (including with spec 12 ground truth).
- **AI call only** when multiple BOM rows are plausible — populate `candidateBomItemIds`; never auto-pick.
- Degrade gracefully: no BOM / no CAD → generic `PartRef.label` ("vite", "staffa") with `bomItemId: null`.
- No AI when the deterministic path suffices (credit discipline).

## Out of scope

- Segmenting the video timeline (spec 05 — video-first only).
- Rewriting `instruction` text (spec 06).
- BOM validation inside the Critic (spec 10 stays text-only).
- A separate “BOM Mapper” generative agent parallel to the Instructor.

## Acceptance criteria

- Given a BOM file + STEP model, reconciled `BomItem[]` lists both sources with clear `source` metadata.
- Given unambiguous video + BOM evidence, steps get resolved `PartRef[]` without `candidateBomItemIds`.
- Given ambiguous evidence, steps get `candidateBomItemIds` and export gate blocks until resolved (spec 09).
- Video-only input still produces complete steps with generic part labels.

## Validation

- `pnpm --filter @vitruvius/core typecheck` (contract addition)
- Package lint/typecheck/test for the BOM parse + reconcile module when implemented
