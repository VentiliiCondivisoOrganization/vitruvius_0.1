# Implementation progress

Living summary of vertical slices shipped or in review. Update this file when a spec lands.

_Last updated: 2026-06-20 (client assessment revision 2 → docs + spec 13–17 stubs)._

## Client alignment roadmap

Full analysis: [client-alignment-assessment.md](./client-alignment-assessment.md).

| Phase        | Deliverable                                                             | Specs                                      | Status                                         |
| ------------ | ----------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------- |
| **Baseline** | Video-first pipeline, editor, keyframe PDF                              | 01–12                                      | In progress (04–05 in review; 06–12 spec/stub) |
| **Phase 1**  | BOM layer, schematic illustrations, regenerate, versioning, export gate | 13, 14 (tier 1), 16, 17 + extensions 08/09 | Spec stubs written; not implemented            |
| **Phase 2**  | Compositor-full (CAD overlay per step)                                  | 14 tier 2                                  | Blocked on pose alignment research             |

## Session summary (2026-06-19 / 2026-06-20)

Foundation work aligned with the client assessment (video-first segmentation, optional audio, human
revision; target illustrated deliverable documented for phase 1+).

| Deliverable                 | Spec                                          | PR / branch                                                                                            | Status           |
| --------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------- |
| Client alignment assessment | — (docs)                                      | [#18](https://github.com/VentiliiCondivisoOrganization/vitruvius/pull/18) + doc revision 2 (local)     | Merged / updated |
| ffmpeg media extraction     | [04-media](../../specs/04-media.md)           | [#20](https://github.com/VentiliiCondivisoOrganization/vitruvius/pull/20) `feat/media-ffmpeg-wrappers` | In review        |
| Segmenter agent             | [05-ai-segment](../../specs/05-ai-segment.md) | `feat/ai-segment` (based on media branch)                                                              | In review        |

### Spec 04 — `@vitruvius/media`

Engine-only ffmpeg wrappers:

- `extractKeyframes`, `extractAudio`, `detectScenes`, `splitIntoClips`
- Structured outputs (timestamps + on-disk file refs); no AI interpretation
- Vitest integration tests (ffmpeg-generated fixtures; skip when ffmpeg absent)

Feeds the Segmenter with keyframes, scene boundaries, clips, and optional audio for downstream
evidence in `sourceNotes` (BOM mapping → spec 13).

### Spec 05 — Segmenter (`@vitruvius/ai`)

`segmentVideoIntoSteps(input)` accepts media artifacts from spec 04 plus optional learnings (spec 11 hook):

- **Provider-pluggable:** `GeminiSegmentProvider` when `GEMINI_API_KEY` is set; `HeuristicSegmentProvider` otherwise
- **Video-first:** absolute timeline segmentation; BOM/CAD do not set step boundaries
- **Credit discipline:** cache on content hash + prompt version; one primary call; sub-chunk only low-confidence windows
- **Output:** schema-valid `ManualStep[]` with bounds, `confidence`, `sourceNotes`, `reviewStatus: hypothesis`

### Still stubbed / next (baseline 06–12)

| Spec               | Package                    | Notes                                                 |
| ------------------ | -------------------------- | ----------------------------------------------------- |
| 06-ai-instructions | `@vitruvius/ai`            | `writeInstructions`; target adds `caption`, `PartRef` |
| 07-engine-worker   | `apps/engine`              | Wire baseline pipeline; extend for 13–14 in phase 1   |
| 10-ai-critic       | `@vitruvius/ai`            | Text-only review — scope unchanged in phase 1         |
| 11-learnings       | `@vitruvius/ai` + db       | Priming wired via `SegmentInput.learnings`            |
| 12-cad-ingest      | `@vitruvius/cad` (planned) | Priming only — not illustrated deliverable            |

### Planned (phase 1 — spec only today)

| Spec                 | Package / app          | Notes                                    |
| -------------------- | ---------------------- | ---------------------------------------- |
| 13-bom-map           | `packages/cad` or peer | Deterministic-first BOM file + reconcile |
| 14-ai-illustrate     | `@vitruvius/ai`        | Illustrator + Compositor-lite (tier 1)   |
| 16-regenerate-job    | web + engine           | `JOB_TYPE: regenerate`                   |
| 17-manual-versioning | `@vitruvius/core`, db  | v1 → v2 enrich                           |

## Spec status matrix

| Spec                 | Status                                        |
| -------------------- | --------------------------------------------- |
| 01-core              | Done (bootstrap); contract extensions pending |
| 02-db                | Done                                          |
| 03-web-upload        | Done                                          |
| 04-media             | Implemented (PR #20)                          |
| 05-ai-segment        | Implemented (`feat/ai-segment`)               |
| 06–11                | Stub / not started                            |
| 12-cad-ingest        | Spec only                                     |
| 13-bom-map           | Spec stub                                     |
| 14-ai-illustrate     | Spec stub                                     |
| 16-regenerate-job    | Spec stub                                     |
| 17-manual-versioning | Spec stub                                     |
