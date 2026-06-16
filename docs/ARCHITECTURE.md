# Architecture

## Product

Vitruvius turns a **video of an assembly/montage process** into an **editable, step-by-step
instruction manual** (IKEA-style), then lets a human review and export it. The positioning is
deliberate: *"AI-generated draft instructions with a guided human revision editor."* It is **not**
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
  → create manual row (uploaded)    → packages/media (ffmpeg)
  → enqueueJob({ type:"process" })  → packages/ai   (segment)
                                     → packages/ai   (instructions)
status page polls                   → save manual via packages/db
manuals.status                      → status processing → ready/failed
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
   segmentation + instructions), saves the manual via `packages/db`, moving `manuals.status` from
   `processing` to `ready` or `failed`.
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
