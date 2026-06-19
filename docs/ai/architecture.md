# Architecture

## Product

Vitruvius turns a **video of an assembly/montage process** into an **editable, step-by-step
instruction manual** (IKEA-style), then lets a human review and export it. The positioning is
deliberate: _"AI-generated draft instructions with a guided human revision editor."_ It is **not**
a fully automatic, perfect manual generator. Every AI output carries a confidence value and source
notes, and a human confirms/corrects before export.

## Repository structure

```
vitruvius/
├── apps/
│   ├── web/        SvelteKit — UI + thin server routes (upload, status, editor, export trigger)
│   └── engine/     Standalone worker container — claims jobs and runs the pipeline
├── packages/
│   ├── core/       FROZEN CONTRACT — types + zod schemas + enums (single source of truth)
│   ├── db/         Supabase client + typed queries + migrations + the jobs queue helpers
│   ├── media/      ffmpeg wrappers (keyframes, audio, scene detection, clip splitting)
│   ├── cad/        digital-model ingest — STEP/mesh → BOM + assembly tree + views (optional; spec 12)
│   ├── ai/         Gemini calls (segmentation, instruction writing)
│   └── export/     HTML template + Playwright print-to-PDF
├── docs/           Centralized architecture / infra / decisions
└── specs/          One spec per vertical slice (the unit of agent work)
```

## Runtime data flow

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
   `uploaded`), and enqueues a `process` job row.
2. **Engine (process):** claims the job, runs `packages/media` (ffmpeg) → `packages/ai` (Gemini
   segmentation + instructions) → `packages/ai` (the **Critic**, an unbiased accuracy review that
   recalibrates `confidence`) → `packages/ai` (distill reusable **learnings**), saves the manual via
   `packages/db`, moving `manuals.status` from `processing` to `ready` or `failed`. Generation is
   primed with relevant prior learnings before it starts. When a **digital model** (CAD/mesh) was
   uploaded with the video, `packages/cad` (spec 12) parses it into a BOM + assembly tree + canonical
   views that also prime generation — auxiliary, never required: a run with no model proceeds on
   video alone.
3. **Web (editor):** a human reviews/corrects the generated steps; each step exposes its
   `confidence`, `reviewStatus`, and `sourceNotes`.
4. **Export:** the web app enqueues an `export` job; the engine renders the manual to HTML and
   prints it to PDF with Playwright, storing the result in Supabase Storage for download.

## The boundary rule

`apps/web` and `apps/engine` **never import each other**. They communicate only through the
database (the `jobs` table + the manual rows) and the shared types in `@vitruvius/core`. The engine
may import `packages/*`; the web app imports `@vitruvius/core` and `@vitruvius/db` only.

This is a **deploy boundary, not a repo boundary**. The engine ships as its own container with its
own scaling cadence, so it can later be rewritten in Python / on GPUs, or extracted to its own repo,
without touching the web app. ffmpeg, Gemini, and Playwright live in the engine, never in the web app.

## The contract-first rule

`@vitruvius/core` defines `ManualStep`, `InstructionManual`, and `Job` (plus the status/enum
constants and matching zod schemas). Everything communicates through these shapes. No other package
redefines them; untrusted/AI output is validated against the core zod schemas.

## Cross-cutting concerns (the AI layer)

These run through every AI-touching spec; the conceptual home is [`ai-layer.md`](./ai-layer.md) and the
trade-offs are decisions 8–10 in [`decisions.md`](./decisions.md).

- **Credit optimization.** AI calls are the dominant variable cost. Credits are a first-class budget:
  cheapest model that clears the bar, one structured call over many round-trips, chunk only what
  needs it, cache on content hash, and attribute spend per manual so it's measurable.
- **Provider-pluggable agents + BYO license (future, out of MVP scope).** All model access goes
  through `packages/ai` and the pipeline depends on agent _interfaces_, never a concrete provider.
  That single seam later becomes an agent registry so a self-hoster can choose which agents to run
  and attach their own license/keys — without touching anything upstream.
- **The Critic.** Accuracy review is a _separate_ agent (spec 10), never the generator grading
  itself. It only scores and flags (recalibrates `confidence`, raises concrete `critique`), keeping
  the editor's trust signal independent of what produced the draft.
- **Meta-learning.** Reusable, core-scope knowledge from a run (and from confirmed human edits) is
  distilled into a learnings store (spec 11) and injected back into future runs — improving accuracy
  and cutting credits.
