# Architecture

## Product

Vitruvius turns a **video of an assembly/montage process** into an **editable, step-by-step
instruction manual** (IKEA-style), then lets a human review and export it. The positioning is
deliberate: _"AI-generated draft instructions with a guided human revision editor."_ It is **not**
a fully automatic, perfect manual generator. Every AI output carries a confidence value and source
notes, and a human confirms/corrects before export.

The [client alignment assessment](./client-alignment-assessment.md) (grill-me, 2026-06) extends the
**target deliverable** toward illustrated IKEA/LEGO manuals: schematic print images
(`illustrationUrl`), structured BOM per step (`PartRef`), optional CAD priming (spec 12), prompt
regeneration in revision, and export gated on human confirmation. That target lands in **two
engineering phases** — see [Pipeline](#pipeline-baseline-vs-target) below. Spec baseline `01`–`12`
is implemented; extension `13` is merged (#34), `14` tier 1 (Illustrator + Compositor-lite, #40),
`16` (regenerate job, #41), and `17` (manual versioning) are implemented; the spec `08` editor adds
BOM disambiguation (#35/#43) and the spec `17` versioning trigger/switcher/freeze. Live status:
[implementation-progress.md](./implementation-progress.md).

## Repository structure

```
vitruvius/
├── apps/
│   ├── web/        SvelteKit — UI + thin server routes (upload, status, editor, export/regenerate trigger)
│   └── engine/     Standalone worker container — claims jobs and runs the pipeline
├── packages/
│   ├── core/       FROZEN CONTRACT — types + zod schemas + enums (single source of truth)
│   ├── db/         Supabase client + typed queries + migrations + the jobs queue helpers
│   ├── media/      ffmpeg wrappers (keyframes, audio, scene detection, clip splitting)
│   ├── cad/        (spec 12) digital-model ingest — STEP/mesh → BOM + assembly tree + views
│   ├── ai/         Agent interfaces (segment, instruct, critique, illustrate — spec 05–06, 10–11, 14)
│   └── export/     HTML template + Playwright print-to-PDF (spec 09)
├── docs/ai/        Architecture, AI layer, decisions, client assessment, progress
└── specs/          One spec per vertical slice — baseline 01–12; extensions 13, 14, 16, 17
```

## Pipeline: baseline vs target

### Baseline (specs 01–12 — current design)

What the repo documents and is building toward first:

```
upload video [+ optional digital model]
  → (12) packages/cad: DigitalModel priming [optional]
  → (04) packages/media: keyframes, audio, scenes, clips
  → (05) Segmenter: video-first timeline → ManualStep[] + sourceNotes
  → (06) Instructor: title, instruction, tools, parts, warnings, alternatives
  → (10) Critic: instruction ↔ sourceNotes (text-only; never rewrites)
  → (11) Learnings: distill + prime future runs
  → save manual → editor (08) → export (09, keyframes today)
```

### Target phase 1 (client deliverable — specs 13, 14 tier 1, 16, 17 + extensions 08/09)

Documented in the [client alignment assessment](./client-alignment-assessment.md) §5.5:

```
upload: video [+ audio] [+ BOM file] [+ CAD/mesh]
  → cad-ingest (12) + bom-file-parse (13) [optional]
  → media (04) → segment (05) → bom-map (13) → instruct (06)
  → critic (10) → illustrate (14 tier 1: Illustrator | Compositor-lite)
  → learnings (11) → editor (08) → export (09, schematic PDF)
```

- **BOM layer (13):** deterministic match first, AI only for ambiguous rows → `PartRef[]` with
  `candidateBomItemIds`. Not a duplicate Instructor.
- **Critic (10) unchanged:** BOM consistency = deterministic flags + export gate, not Critic scope.
- **Export gate:** all steps `reviewStatus: confirmed`, no open BOM candidates (spec 08/09).
- **Regenerate (16):** new `JOB_TYPE: regenerate` with scope `text` | `illustration` | `layout` |
  `structure` — reuses Instructor / Illustrator, not a separate “Regenerator” agent.

### Target phase 2 (grill-me compositing CAD per passo)

**Compositor-full** — geometric overlay per step on CAD renders — requires video↔geometry pose
alignment (research; explicitly out of scope for spec 12). Does not block phase 1.

## Runtime data flow (baseline)

```
apps/web                          apps/engine                         apps/web
────────                          ───────────                         ────────
upload video                      claim queued job
  → store file in Storage         (FOR UPDATE SKIP LOCKED)
  → create manual row (uploaded)    → packages/ai   (prime w/ learnings)
  → enqueueJob({ type:"process" })  → packages/media (ffmpeg)
                                     → packages/ai   (segment)
                                     → packages/ai   (instructions)
status page polls                   → packages/ai   (critic — unbiased review)
manuals.status                      → packages/ai   (distill learnings)
                                     → save manual via packages/db
                                     → status processing → ready/failed
                                                                      review & correct
                                                                      in the editor
                                                                        ↓
                                                                      enqueueJob({type:"export"})
                                  claim export job
                                     → packages/export renders HTML
                                     → Playwright prints PDF
                                     → store PDF in Storage
                                                                      download when ready
```

1. **Web (upload):** stores the video in Supabase Storage, creates a `manuals` row (status
   `uploaded`), and enqueues a `process` job row. Target: optional digital model + BOM file (spec 13).
2. **Engine (process):** claims the job, runs the pipeline (see baseline above). Spec 12 adds
   optional `packages/cad` priming — auxiliary, never required. Target phase 1 inserts bom-map and
   illustrate stages after instruct and before/after critic per assessment §5.5.
3. **Web (editor):** human reviews steps (`confidence`, `reviewStatus`, `sourceNotes`, `critique`).
   Target: resolve `PartRef.candidateBomItemIds` (same UX pattern as `alternatives`), enqueue
   `regenerate` jobs (spec 16).
4. **Export:** web enqueues `export`; engine renders PDF. Target: schematic layout via
   `illustrationUrl` + `caption`; reject export if gate rules fail (spec 09).

## The boundary rule

`apps/web` and `apps/engine` **never import each other**. They communicate only through the
database (the `jobs` table + the manual rows) and the shared types in `@vitruvius/core`. The engine
may import `packages/*`; the web app imports `@vitruvius/core` and `@vitruvius/db` only.

This is a **deploy boundary, not a repo boundary**. The engine ships as its own container with its
own scaling cadence, so it can later be rewritten in Python / on GPUs, or extracted to its own repo,
without touching the web app. ffmpeg, Gemini, and Playwright live in the engine, never in the web app.

## The contract-first rule

`@vitruvius/core` defines `ManualStep`, `InstructionManual`, and `Job` (plus status enums and zod
schemas). Everything communicates through these shapes.

**Bootstrap today (spec 01):** `keyframeUrl`, `instruction`, `parts: string[]`, etc.

**Planned extensions** (coordinated breaking change — specs 10–12, 13–17; see
[assessment §5.1](./client-alignment-assessment.md)):

- `critique`, `Learning`, `DigitalModel` / `BomItem` (specs 10–12)
- `PartRef`, `illustrationUrl`, `caption` alongside `instruction`, manual versioning (specs 13–17)
- `JOB_TYPE`: `regenerate` + `Job.payload` (`RegenerateRequest`) — landed (spec 16); `enrich` +
  `InstructionManual.version` / `parentVersionId` — landed (spec 17)
- `BomItem.partName` vs `BomItem.bomCode` — CAD-derived names vs client distinta codes

No other package redefines these shapes; untrusted/AI output is validated against core zod schemas.

## Cross-cutting concerns (the AI layer)

These run through every AI-touching spec; the conceptual home is [`ai-layer.md`](./ai-layer.md) and
the trade-offs are decisions 8–12 in [`decisions.md`](./decisions.md).

- **Credit optimization.** Cheapest model that clears the bar; one structured call over round-trips;
  chunk only what needs it; cache on content hash; attribute spend per manual. Image generation (spec 14) must batch and cache — see assessment risks.
- **Provider-pluggable agents + BYO license (future, out of MVP scope).** All model access through
  `packages/ai`; pipeline depends on agent _interfaces_, never a concrete provider.
- **The Critic (spec 10).** Separate agent; scores `instruction` against `sourceNotes` only. Does
  **not** validate BOM or illustrations — that stays deterministic (spec 13) or export gate (spec 09).
- **Meta-learning (spec 11).** Reusable heuristics from runs and confirmed edits; primes Segmenter and
  Instructor.
- **Deterministic lanes.** Spec 12 (`packages/cad`) and BOM file parsing (spec 13) prefer local
  compute over AI credits when the input file already states the answer.

## Related docs

- [Client alignment assessment](./client-alignment-assessment.md) — grill-me decisions, gap analysis, spec 13+
- [Implementation progress](./implementation-progress.md) — what is coded vs spec-only
- [AI layer](./ai-layer.md) — agent roster and credit discipline
- [README pipeline diagram](../../README.md) — baseline flowchart; phase 1 nodes marked planned there
