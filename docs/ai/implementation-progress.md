# Implementation progress

Living summary of vertical slices shipped or in review. Update this file when a spec lands.

_Last updated: 2026-06-23 (spec 14 tier 1 merged #40; spec 16 regenerate merged #41; spec 17 manual versioning implemented; spec 13 merged #34; spec 08 BOM disambiguation UI in progress)._

## Client alignment roadmap

Full analysis: [client-alignment-assessment.md](./client-alignment-assessment.md).

| Phase        | Deliverable                                                             | Specs                                      | Status                                                                                                                                                                                  |
| ------------ | ----------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Baseline** | Video-first pipeline, editor, keyframe PDF                              | 01–12                                      | **Done** on `main` (PRs #21–#30)                                                                                                                                                        |
| **Phase 1**  | BOM layer, schematic illustrations, regenerate, versioning, export gate | 13, 14 (tier 1), 16, 17 + extensions 08/09 | **13 merged (#34)**; **14 tier 1 merged (#40)**; **16 regenerate merged (#41)**; **17 versioning implemented**; **08 BOM disambiguation UI in progress**; PartRef contract merged (#33) |
| **Phase 2**  | Compositor-full (CAD overlay per step)                                  | 14 tier 2                                  | Blocked on pose alignment research                                                                                                                                                      |

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

### Web editor — BOM disambiguation (spec 08 extension)

Branch `feat/web-bom-disambiguation`:

- Editor UI to pick among `PartRef.candidateBomItemIds` (same pattern as alternatives)
- `@vitruvius/core` helpers: `resolvePartRefBomCandidate`, `formatManualBomItem`
- Export gate already blocks until resolved; banner + per-part picker in editor

### AI Illustrator — tier 1 (spec 14)

Branch `claude/brave-mayer-7zr2mr`:

- `@vitruvius/ai` Illustrator agent: per-step `illustrationUrl` from the video keyframe
  (Illustrator path) or a canonical CAD view when `digitalModelStatus: primed`
  (Compositor-lite), behind a provider interface (`Heuristic` | `Gemini`).
- Shared style template, per-step cache on hash(base image + prompt + style version),
  output written as file refs (never inline image bytes in the contract).
- Engine `process` pipeline wires it after the Critic, non-fatal (keyframes remain export
  evidence on failure). Tier 2 (Compositor-full / pose alignment) stays phase 2.

### Regenerate job — spec 16

Branch `claude/regenerate-job-spec16` (stacked on the spec 14 branch):

- `@vitruvius/core`: `JOB_TYPE` adds `regenerate`; new `RegenerateRequest` (`scope`,
  `prompt`, `stepIds`) carried on `Job.payload` (breaking contract change).
- `@vitruvius/db`: migration `0008` (jobs.type CHECK + jsonb `payload`); `enqueueJob`
  accepts a payload.
- `@vitruvius/ai`: Instructor and Illustrator gain optional `guidance` (the editor prompt),
  folded into the prompt and the cache key — reuse, not a new "Regenerator" agent.
- `apps/engine`: claims `regenerate`, dispatches `text` → Instructor, `illustration` /
  `layout` → Illustrator, persists the targeted step(s) and demotes them to `edited`.
  `structure` scope is deferred (throws for now).
- `apps/web`: editor panel to pick a step + scope + prompt and enqueue the job (web never
  calls AI).

### Manual versioning — spec 17

Branch `claude/sleepy-ptolemy-wwo15q` (on top of specs 14 + 16):

- `@vitruvius/core`: `InstructionManual` gains `version` + `parentVersionId`; `JOB_TYPE`
  adds `enrich` (breaking contract change).
- `@vitruvius/db`: migration `0009` (manuals `version`/`parent_version_id` + lineage index;
  `enrich` job type; `save_manual` persists the new columns). `createManualVersion` copies a
  parent manual with fresh step ids and enqueues an `enrich` job; `listManualVersions` walks
  the lineage.
- `apps/engine`: claims `enrich`, re-maps BOM and re-illustrates on the existing step timeline
  (no re-segmentation), reusing the spec 13 / 14 agents.

### Next vertical slices (phase 1)

Phase 1 core slices (13, 14, 16, 17) are implemented; remaining work is the spec 08 / 09
export gate + schematic PDF polish.

## Spec status matrix

| Spec                 | Status                                                            |
| -------------------- | ----------------------------------------------------------------- |
| 01-core              | Bootstrap done; PartRef extension merged (#33)                    |
| 02-db                | Done; migrations 0006 (#33) + 0007 (#34)                          |
| 03–07                | Done on `main`                                                    |
| 08-web-editor        | **BOM disambiguation UI in progress** (08 ext.)                   |
| 09–12                | Done on `main`                                                    |
| 13-bom-map           | **Merged** (#34)                                                  |
| 14-ai-illustrate     | **Tier 1 merged (#40)** (Illustrator + Compositor-lite)           |
| 16-regenerate-job    | **Merged (#41)** (text + illustration/layout; structure deferred) |
| 17-manual-versioning | **Implemented** (version lineage + `enrich` job; v1→v2 timeline)  |
