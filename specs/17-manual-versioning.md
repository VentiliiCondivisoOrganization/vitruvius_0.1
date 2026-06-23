# Spec: 17-manual-versioning

**Goal:** When a BOM file and/or digital model arrives **after** a video-only manual is already
generated, enrich it on the **same step timeline** without re-watching the video — as a new,
immutable manual version (v1 → v2 → …) so the original stays intact and exportable.
**Package/app(s):** `@vitruvius/core`, `packages/db`, `apps/engine`, `apps/web`.
**Depends on:** 01-core, 02-db, 08-web-editor, 09-export, 13-bom-map, 14-ai-illustrate.

> Design source: [client alignment assessment](../docs/ai/client-alignment-assessment.md) grill-me
> domanda 10. The contract fields (`version`, `parentVersionId`) and the `enrich` job type are
> **already landed** (#33/#44); this spec is the source of truth for the remaining end-to-end slice:
> the web trigger, the version list/open UI, the immutability rule, and how enrichment preserves
> human edits.

## Why this exists

The pipeline is video-first: a usable manual is produced from the video alone. But the precise part
names and fastener codes that turn a draft into an IKEA-style manual often live in a BOM file or CAD
export that is **not available when the video is first uploaded** — it shows up later. Re-running the
whole expensive pipeline (re-segmentation, re-instruction, re-critique) to absorb that file would
waste credits and, worse, **throw away the human review already done on v1**. Versioning lets the
engine re-map BOM (spec 13) and re-illustrate (spec 14) onto the _existing_ steps, cheaply, while
keeping v1 frozen as an auditable, still-exportable snapshot.

## The version model

- A manual lineage is a **linear chain**: `v1 (parentVersionId: null)` → `v2 (parentVersionId: v1.id)`
  → … Each version is a **separate `manuals` row** with its own `id` and its own copy of the steps
  (fresh `step.id`s), sharing only `startMs`/`endMs` — the timeline — with its parent.
- **The head (highest `version`) is the only editable version.** Any version that has a descendant is
  **frozen**: read-only in the editor, but still loadable and exportable. This makes v1 an immutable
  audit snapshot the moment v2 exists.
- Enrichment **never re-segments**. The step count and time bounds are copied verbatim from the parent.
  (Re-segmentation is a `regenerate` `structure`-scope concern (spec 16), deferred — not part of
  versioning.)

## Inputs

- An existing **head** `InstructionManual` in status `ready` (e.g. v1, video-only).
- A new upload from the editor: a BOM file, a digital model (CAD/mesh), or both — validated by the
  same rules as the initial upload (spec 03 extension: CSV BOM; STEP/OBJ/STL model).
- Env (engine): `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` (illustration), CAD-kernel deps as spec 12.

## Outputs

- A new `manuals` row: `version = parent.version + 1`, `parentVersionId = parent.id`, status
  `processing` → `ready`/`failed`. Its `bomFileUrl`/`digitalModelUrl` point at the **new** upload
  (falling back to the parent's refs when only one of the two is supplied).
- An enqueued `enrich` job targeting the new version.
- After the job: the new version's steps gain/refresh `parts: PartRef[]` (with `candidateBomItemIds`
  where ambiguous) and `illustrationUrl`, plus a reconciled `InstructionManual.bom`.

## In scope

### Contract (already landed — restated as the source of truth)

- `InstructionManual.version: number` and `parentVersionId: string | null`.
- `JOB_TYPE` includes `enrich`. An `enrich` job carries **no payload**: its inputs are the new
  version row's `bomFileUrl`/`digitalModelUrl` columns, set by `createManualVersion`.

### DB (`packages/db`)

- `createManualVersion(parentId, { bomFileUrl?, digitalModelUrl? })`: load the parent, copy it with a
  fresh `id`, bumped `version`, `parentVersionId`, the **new** file refs, status `processing`, and
  steps re-keyed with fresh ids; persist it and enqueue the `enrich` job. The parent row is **not
  touched**.
- `listManualVersions(anyMemberId)`: return the lineage oldest-first (walk to root, collect
  descendants) for the version switcher.

### Engine (`apps/engine` — `enrich` handler)

- Claim `enrich`; require `parentVersionId` to be set; set status `processing`.
- Ingest the version's BOM/CAD refs, reconcile (spec 13), **re-map BOM onto the existing steps**, run
  disambiguation, and **re-illustrate** only when a model is `primed` (spec 14, Compositor-lite).
  Illustration failure is non-fatal (keyframes remain export evidence), matching `process`.
- **Preserve human work:** copy `title`, `instruction`, `tools`, `warnings`, `alternatives`, and each
  step's `reviewStatus`/`critique` from the parent unchanged. Enrich only _derives_ `parts`, `bom`,
  and `illustrationUrl`. It must **not** rewrite instruction text or silently re-confirm/-unconfirm a
  step's `reviewStatus`.
- Newly-introduced ambiguous parts surface as `candidateBomItemIds`; the **export gate (spec 09)
  already blocks** on open candidates regardless of `reviewStatus`, so the user is forced to resolve
  the new BOM choices in the editor before exporting v2 — no extra reset needed.
- Save the version `ready` on success, `failed` on error (never a silent partial write).

### Web (`apps/web` — the trigger + the switcher)

- On a **head** manual's editor page: an "Add BOM / digital model" panel that uploads the new
  file(s), calls `createManualVersion`, and redirects to the new version's editor. (The web never
  calls AI; it only stores files and enqueues the job — same boundary as initial upload.)
- A **version switcher** (list + open) built on `listManualVersions`: show every version with its
  number/status, link to each, and mark the head as editable and ancestors as read-only.
- On a **frozen** (non-head) version: the editor renders read-only and offers export but not edits.

## Out of scope

- Merging two different videos into one manual.
- Automatic re-segmentation when BOM/CAD arrives — the timeline stays video-first (re-segment is the
  deferred spec 16 `structure` scope, not this spec).
- Non-linear version branching / diff-merge UI (MVP is a linear chain; the DB walk tolerates branches
  defensively but the UI does not expose them).
- Enriching a non-head version (must branch from the head; enriching an ancestor is rejected).
- New BOM/CAD **formats** beyond what spec 03/13 already accept (CSV BOM; STEP/OBJ/STL model).

## Acceptance criteria

- Adding a BOM file to a video-only `ready` v1 (via the editor panel) creates v2 on the same timeline
  with `PartRef` codes populated where mappable; the step count and `startMs`/`endMs` are identical to
  v1, and v1's human-edited `instruction`/`title`/`reviewStatus` are carried into v2 unchanged.
- Adding a CAD model re-illustrates the affected steps in v2; an illustration failure leaves the
  keyframe-based step intact and the job still reaches `ready`.
- Ambiguous new parts produce `candidateBomItemIds` in v2 and the **export gate blocks** until they
  are resolved in the editor.
- v1 is still loadable and exportable after v2 exists, and is **read-only** in the editor; only the
  head version accepts edits.
- The version switcher lists the full lineage oldest-first from any member id.

## Validation

- `pnpm --filter @vitruvius/core typecheck`
- `pnpm --filter @vitruvius/db typecheck`
- `pnpm --filter @vitruvius/web typecheck` `lint` `build`
- `pnpm --filter @vitruvius/engine build`
- Integration: enrich a fixture v1 → v2 with a BOM file attached from the editor; confirm same
  timeline, populated `PartRef`, preserved edits, a blocking BOM candidate, and a still-exportable v1.
