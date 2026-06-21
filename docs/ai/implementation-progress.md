# Implementation progress

Living summary of vertical slices shipped or in review. Update this file when a spec lands.

_Last updated: 2026-06-21 (spec 13 BOM map layer on `feat/bom-map`)._
_Last updated: 2026-06-21 (core PartRef contract + implementation-progress sync)._

## Client alignment roadmap

Full analysis: [client-alignment-assessment.md](./client-alignment-assessment.md).

| Phase        | Deliverable                                                             | Specs                                      | Status                                         |
| ------------ | ----------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------- |
| **Baseline** | Video-first pipeline, editor, keyframe PDF                              | 01–12                                      | **Done** on `main` (PRs #21–#30)               |
| **Phase 1**  | BOM layer, schematic illustrations, regenerate, versioning, export gate | 13, 14 (tier 1), 16, 17 + extensions 08/09 | **13 in PR** (`feat/bom-map`); core contract in merge queue (#33) |
| **Phase 2**  | Compositor-full (CAD overlay per step)                                  | 14 tier 2                                  | Blocked on pose alignment research             |

## Shipped on `main` (baseline 01–12)

| Spec               | Package / app       | PR  | Notes                                   |
| ------------------ | ------------------- | --- | --------------------------------------- |
| 01-core            | `@vitruvius/core`   | —   | Bootstrap contract                      |
| 02-db              | `@vitruvius/db`     | —   | Postgres + `save_manual`                |
| 03-web-upload      | `apps/web`          | —   | Video upload + job enqueue              |
| 04-media           | `@vitruvius/media`  | #20 | ffmpeg wrappers                         |
| 05-ai-segment      | `@vitruvius/ai`     | #21 | Segmenter agent                         |
| 06-ai-instructions | `@vitruvius/ai`     | #24 | Instruction Writer                      |
| 07-engine-worker   | `apps/engine`       | #27 | Full process pipeline                   |
| 08-web-editor      | `apps/web`          | #28 | Guided revision editor                  |
| 09-export          | `@vitruvius/export` | #30 | HTML → PDF (keyframes today)            |
| 10-ai-critic       | `@vitruvius/ai`     | #25 | Text-only Critic                        |
| 11-learnings       | `@vitruvius/ai`     | #26 | Distill + priming                       |
| 12-cad-ingest      | `@vitruvius/cad`    | #29 | STEP/mesh priming (`BomItem` CAD shape) |

Docs alignment (assessment revision 2, spec stubs 13–17): [#31](https://github.com/VentiliiCondivisoOrganization/vitruvius/pull/31) merged.

## In progress

### Core contract extension (spec 01 → enables spec 13)

PR [#33](https://github.com/VentiliiCondivisoOrganization/vitruvius/pull/33) (`feat/core-partref-contract`, merge queue):

- `PartRef[]` replaces `parts: string[]` on `ManualStep`
- `ManualBomItem` + `InstructionManual.bom` (CAD `BomItem` unchanged for spec 12)
- `caption`, `illustrationUrl` on steps (empty until spec 06/14)
- DB migration `0006_part_refs.sql`

### BOM map layer (spec 13)

Branch `feat/bom-map` (stacked on #33):

- `@vitruvius/cad` — CSV parse, CAD/file reconcile, deterministic `mapBomToSteps`
- `@vitruvius/ai` — optional disambiguation pass (never auto-resolves `bomItemId`)
- Engine pipeline: segment → bom-map → instruct → critic; persists `manual.bom`
- Web upload: optional BOM CSV + STEP/OBJ/STL; export gate via `checkExportGate`
- DB migration `0007_manual_upload_refs.sql` (`bom_file_url`, `digital_model_url`)

### Next vertical slices (phase 1)

| Spec                 | Package / app          | Depends on                          |
| -------------------- | ---------------------- | ----------------------------------- |
| 14-ai-illustrate     | `@vitruvius/ai`        | Core + instruct/critic pipeline     |
| 16-regenerate-job    | web + engine           | Core `JOB_TYPE: regenerate` (later) |
| 17-manual-versioning | core + db              | Core versioning fields (later)      |

## Spec status matrix

| Spec                 | Status                                      |
| -------------------- | ------------------------------------------- |
| 01-core              | Bootstrap done; **PartRef extension in PR #33** |
| 02-db                | Done; migrations 0006 (#33) + 0007 (#13 PR)     |
| 03–12                | Done on `main`                                  |
| 13-bom-map           | **Implemented** on `feat/bom-map` (PR pending)  |
| 14-ai-illustrate     | Spec stub                                   |
| 16-regenerate-job    | Spec stub                                   |
| 17-manual-versioning | Spec stub                                   |
