# Spec: 04-media

**Goal:** ffmpeg extraction utilities for the engine pipeline.
**Package/app(s):** `packages/media`.
**Depends on:** 01-core.

## Inputs

- A local path / file reference to a video (provided by the engine).

## Outputs

- Structured results: candidate keyframes (timestamps + file refs), an extracted audio track,
  detected scene boundaries, and split clips.

## In scope

- Extract candidate keyframes.
- Extract the audio track.
- Detect scene changes.
- Split the video into clips.
- Return structured results (timestamps + file refs), not raw ffmpeg output.

## Out of scope

- Any AI interpretation of the frames/audio (specs 05–06).
- Imports into `apps/web` — this package is engine-only.

## Acceptance criteria

- Given a sample video, the functions return frames / audio / scene boundaries.
- Unit-tested on a short fixture.

## Validation

- `pnpm --filter @vitruvius/media typecheck`
- `pnpm --filter @vitruvius/media lint`
- `pnpm --filter @vitruvius/media test` (against a short fixture video)
