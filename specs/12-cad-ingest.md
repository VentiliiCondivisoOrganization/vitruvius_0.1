# Spec: 12-cad-ingest

**Goal:** Ingest an optional digital model (CAD/mesh) shipped alongside a video and turn it into a structured, AI-priming artifact (bill of materials + assembly tree + canonical views) that raises segmentation and instruction accuracy.
**Package/app(s):** `packages/cad` (new, engine-only); adds `DigitalModel` types to `@vitruvius/core`; consumed by specs 05–06.
**Depends on:** 01-core, 04-media (peer pattern). Feeds 05-ai-segment and 06-ai-instructions.

## Why this exists

Many real montage jobs ship with the part's digital model — a STEP/OBJ/STL exported from Inventor, SolidWorks, Fusion, etc. The video alone forces the AI to guess part names and fastener sizes from pixels; the model already knows them exactly. A STEP file in particular carries the **product/assembly structure and named parts** (e.g. a HIWIN linear guide exports as rail + carriage + end seal + `M4` bolts), which is precisely the vocabulary an IKEA-style manual needs. Treated as auxiliary priming, the model cuts hallucinated part names and lets the Critic calibrate confidence against ground truth — at deterministic, near-zero credit cost.

## Inputs

- An optional local path / file reference to a digital model that accompanied the upload (provided by the engine, stored next to the video).
- Supported formats: STEP (`.stp`/`.step`, AP203/214/242) and mesh (`.obj`, `.stl`). Others are recognized-but-unsupported (logged, skipped).
- No AI keys — this package makes no model calls.

## Outputs

- A `DigitalModel` artifact (new `@vitruvius/core` type, zod-validated): a normalized **bill of materials** (`BomItem[]`: part name, quantity, source id), an **assembly tree** (parent → child occurrences), source metadata (originating system, units, schema), and optional **canonical view** image refs (e.g. ISO / per-part renders) for priming.
- `digitalModelStatus` on the manual (new `@vitruvius/core` enum: `primed` | `absent` | `unsupported` | `failed`) recording whether a usable model was present, so the Critic and editor can see that a run was model-primed.

## In scope

- Parse STEP product structure into a BOM + assembly tree (deterministic text parse; no kernel required for this path).
- Parse mesh files into basic geometry stats; produce render refs when the kernel is available.
- Render a small set of **canonical views** (whole-assembly + per-named-part) via a CAD/mesh kernel, returned as file refs — never inlined.
- Normalize and decode part names (incl. non-ASCII/STEP `\X2\` escapes) before they reach the AI.
- Return a schema-valid `DigitalModel`; validate against the `@vitruvius/core` zod schema.
- **Credit/quality discipline** (see [`docs/ai/ai-layer.md`](../docs/ai/ai-layer.md)): parsing and rendering are deterministic local compute, not AI credits — prefer them over asking a model to infer what the file already states. Cache the artifact on a content hash of the model file.
- Degrade gracefully: when no model is supplied, is unsupported, or fails to parse, the pipeline runs unchanged on video alone (the model is auxiliary, never required).

## Out of scope

- Generating, editing, or writing CAD/mesh files of any kind.
- **Precise video↔geometry pose alignment** and automatic per-step exploded views — a real research item; this spec only supplies the BOM/tree/views as priming context, not a frame-accurate geometric overlay.
- Photorealistic rendering or interactive 3D in the editor (spec 08 may add a static viewer later).
- Any import into `apps/web` — this package is engine-only, like `packages/media`.
- Redefining shared shapes locally — the `DigitalModel`/`BomItem` types live in `@vitruvius/core`.

## Acceptance criteria

- Given a sample STEP assembly, returns a `DigitalModel` whose BOM lists the named parts (rail, carriage, end seal, `M4`, …) with quantities, plus the assembly tree; non-ASCII part names are decoded.
- Given a sample `.obj`, returns geometry stats and (when the kernel is present) at least one canonical view ref.
- When no model / an unsupported file is supplied, `digitalModelStatus` is `absent` / `unsupported` (respectively) and the engine pipeline still completes from video alone.
- Output is `DigitalModel`-schema-valid; nothing leaks a concrete CAD-kernel type past the package boundary.

## Validation

- `pnpm --filter @vitruvius/cad typecheck`
- `pnpm --filter @vitruvius/cad lint`
- `pnpm --filter @vitruvius/cad test` (STEP-parse + mesh-stats on short fixtures; the kernel-dependent render test runs only where the kernel is installed)
- The CAD kernel is a heavy native dependency that ships in the **engine container**, not plain CI: scaffold the render job commented-out in [`checks.yml`](../.github/workflows/checks.yml) with a note on what enables it (Docker), per the PR & CI guide; the parse path stays covered by the standard `test` job.
