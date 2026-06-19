# Implementation progress

Living summary of vertical slices shipped or in review. Update this file when a spec lands.

_Last updated: 2026-06-20 (session: alignment assessment → media → segment)._

## Session summary (2026-06-19 / 2026-06-20)

This session moved Vitruvius from bootstrap stubs toward a real engine pipeline foundation, aligned with the [client alignment assessment](./client-alignment-assessment.md) (video-first segmentation, optional audio, human revision later).

| Deliverable                 | Spec                                          | PR / branch                                                                                            | Status    |
| --------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------- |
| Client alignment assessment | — (docs)                                      | [#18](https://github.com/VentiliiCondivisoOrganization/vitruvius/pull/18)                              | Merged    |
| ffmpeg media extraction     | [04-media](../../specs/04-media.md)           | [#20](https://github.com/VentiliiCondivisoOrganization/vitruvius/pull/20) `feat/media-ffmpeg-wrappers` | In review |
| Segmenter agent             | [05-ai-segment](../../specs/05-ai-segment.md) | `feat/ai-segment` (based on media branch)                                                              | In review |

### Spec 04 — `@vitruvius/media`

Engine-only ffmpeg wrappers:

- `extractKeyframes`, `extractAudio`, `detectScenes`, `splitIntoClips`
- Structured outputs (timestamps + on-disk file refs); no AI interpretation
- Vitest integration tests (ffmpeg-generated fixtures; skip when ffmpeg absent)

Feeds the Segmenter with keyframes, scene boundaries, clips, and optional audio for downstream BOM hints.

### Spec 05 — Segmenter (`@vitruvius/ai`)

`segmentVideoIntoSteps(input)` accepts media artifacts from spec 04 plus optional learnings (spec 11 hook):

- **Provider-pluggable:** `GeminiSegmentProvider` (REST, JSON schema response) when `GEMINI_API_KEY` is set; `HeuristicSegmentProvider` (ffmpeg scene boundaries) otherwise
- **Video-first:** prompt instructs absolute timeline segmentation; no BOM/CAD driver
- **Credit discipline:** in-process cache on content hash + prompt version; one primary call; sub-chunk only low-confidence / fast windows
- **Output:** schema-valid `ManualStep[]` with `startMs`, `endMs`, `confidence`, `sourceNotes`, `reviewStatus: hypothesis`; instruction fields empty for spec 06

### Still stubbed / next

| Spec               | Package                    | Notes                                              |
| ------------------ | -------------------------- | -------------------------------------------------- |
| 06-ai-instructions | `@vitruvius/ai`            | `writeInstructions`                                |
| 07-engine-worker   | `apps/engine`              | wire media → segment → db                          |
| 10-ai-critic       | `@vitruvius/ai`            | decoupled review                                   |
| 11-learnings       | `@vitruvius/ai` + db       | priming already wired via `SegmentInput.learnings` |
| 12-cad-ingest      | `@vitruvius/cad` (planned) | spec written by Antonio                            |

## Spec status matrix

| Spec          | Status                          |
| ------------- | ------------------------------- |
| 01-core       | Done (bootstrap)                |
| 02-db         | Done                            |
| 03-web-upload | Done                            |
| 04-media      | Implemented (PR #20)            |
| 05-ai-segment | Implemented (`feat/ai-segment`) |
| 06–11         | Stub / not started              |
| 12-cad-ingest | Spec only                       |
