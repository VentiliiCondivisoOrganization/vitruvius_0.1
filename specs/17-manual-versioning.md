# Spec: 17-manual-versioning

**Goal:** Support incremental enrichment when BOM and/or CAD are added after a video-only manual — same step timeline, new manual version (v1 → v2).
**Package/app(s):** `@vitruvius/core`, `packages/db`, `apps/engine`.
**Depends on:** 01-core, 02-db, 13-bom-map, 14-ai-illustrate.

> Design source: [client alignment assessment](../docs/ai/client-alignment-assessment.md) grill-me domanda 10.

## Inputs

- An existing `InstructionManual` (e.g. v1, video-only).
- New uploads: BOM file, CAD/mesh, or both.
- Enqueue enrichment job (new job type or parameterized `process` — decide at implementation).

## Outputs

- New `InstructionManual` row: `version` incremented, `parentVersionId` pointing at prior version.
- Same step count and `startMs`/`endMs` as v1 unless the user explicitly re-segments in the editor.
- Updated `PartRef[]`, `illustrationUrl` where CAD/BOM warrants re-illustration.

## In scope

- Contract: `InstructionManual.version`, `parentVersionId`.
- DB schema + queries to list versions of a manual lineage.
- Engine job: re-run spec 13 bom-map + spec 14 illustrate on existing steps (no re-segment by default).
- v1 remains readable/exportable (immutable snapshot or frozen at last export — pick at implementation).

## Out of scope

- Merging two different videos into one manual.
- Automatic re-segmentation when BOM arrives (timeline stays video-first).
- Version branching UI beyond list + open (MVP: linear v1 → v2 chain).

## Acceptance criteria

- Adding a BOM to a video-only v1 produces v2 with `PartRef` codes populated where mappable; timeline unchanged.
- Adding CAD triggers re-illustration on affected steps in v2.
- v1 is still loadable after v2 is created.

## Validation

- `pnpm --filter @vitruvius/core typecheck`
- `pnpm --filter @vitruvius/db typecheck`
- Integration: enrich fixture manual v1 → v2 with BOM file attached
