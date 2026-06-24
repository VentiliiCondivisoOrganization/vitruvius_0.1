# Implementation progress

Living summary of vertical slices shipped or in review. Update this file when a spec lands.

_Last updated: 2026-06-24 (spec 09 schematic export keyframe-fallback divergence resolved — keyframe
demoted to a marked reference, illustration is the only primary image; regenerate `structure` scope
wired engine-side — split/merge + Instructor,
now with engine vitest coverage + a `test-engine` CI job; spec 15 auth + multi-tenancy merged #45; UI
localization en/it/es/fr merged #48; CI hardened against
live Supabase + Dockerfile #37; end-to-end integration flow #38; premium dark-theme polish #39.
Earlier: spec 14 tier 1 #40; spec 16 regenerate #41; spec 17 versioning #44/#46 + enrich integration
test #47; spec 13 #34; spec 08 BOM disambiguation #35/#43)._

> **How to read this file.** It tracks **what is developed** (code on `main`). Where the code and the
> **decided** spec/architecture diverge, the gap is called out in
> [Decided vs developed — open discrepancies](#decided-vs-developed--open-discrepancies) rather than
> by quietly editing the spec. Specs and `decisions.md` remain the record of intent; this doc is the
> record of reality.

## Client alignment roadmap

Full analysis: [client-alignment-assessment.md](./client-alignment-assessment.md).

| Phase        | Deliverable                                                             | Specs                                      | Status                                                                                                                                                                                               |
| ------------ | ----------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Baseline** | Video-first pipeline, editor, keyframe PDF                              | 01–12                                      | **Done** on `main` (PRs #21–#30)                                                                                                                                                                     |
| **Phase 1**  | BOM layer, schematic illustrations, regenerate, versioning, export gate | 13, 14 (tier 1), 16, 17 + extensions 08/09 | **13 merged (#34)**; **14 tier 1 merged (#40)**; **16 regenerate merged (#41)**; **17 versioning implemented end-to-end**; **08 BOM disambiguation merged (#35/#43)**; PartRef contract merged (#33) |
| **Phase 1+** | Auth + multi-tenancy; UI localization                                   | 15 (+ unspecced i18n)                      | **15 auth merged (#45)**; **localization en/it/es/fr merged (#48)** — see [discrepancies](#decided-vs-developed--open-discrepancies)                                                                 |
| **Phase 2**  | Compositor-full (CAD overlay per step)                                  | 14 tier 2                                  | Blocked on pose alignment research                                                                                                                                                                   |

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

## Phase 1 slices (shipped)

### Web editor — BOM disambiguation (spec 08 extension) — merged (#35, #43)

- Editor UI to pick among `PartRef.candidateBomItemIds` (same pattern as alternatives)
- `@vitruvius/core` helpers: `resolvePartRefBomCandidate`, `formatManualBomItem`
- Export gate already blocks until resolved; banner + per-part picker in editor

### AI Illustrator — tier 1 (spec 14) — merged (#40)

- `@vitruvius/ai` Illustrator agent: per-step `illustrationUrl` from the video keyframe
  (Illustrator path) or a canonical CAD view when `digitalModelStatus: primed`
  (Compositor-lite), behind a provider interface (`Heuristic` | `Gemini`).
- Shared style template, per-step cache on hash(base image + prompt + style version),
  output written as file refs (never inline image bytes in the contract).
- Engine `process` pipeline wires it after the Critic, non-fatal (keyframes remain export
  evidence on failure). Tier 2 (Compositor-full / pose alignment) stays phase 2.

### Regenerate job — spec 16 — merged (#41)

- `@vitruvius/core`: `JOB_TYPE` adds `regenerate`; new `RegenerateRequest` (`scope`,
  `prompt`, `stepIds`) carried on `Job.payload` (breaking contract change).
- `@vitruvius/db`: migration `0008` (jobs.type CHECK + jsonb `payload`); `enqueueJob`
  accepts a payload.
- `@vitruvius/ai`: Instructor and Illustrator gain optional `guidance` (the editor prompt),
  folded into the prompt and the cache key — reuse, not a new "Regenerator" agent.
- `apps/engine`: claims `regenerate`, dispatches `text` → Instructor, `illustration` /
  `layout` → Illustrator, persists the targeted step(s) and demotes them to `edited`.
- **`structure` scope wired** (`regenerate.ts` → `restructureSteps`): a deterministic
  split/merge of the selected step(s) — the same semantics as the editor's split/merge
  (spec 08) — followed by re-running the Instructor on the affected step(s) with the prompt
  as `guidance`. One target → split at its midpoint; ≥2 contiguous targets → merge. Reuses
  existing agents (no re-segmentation, no source-video re-download, no segment credits). The
  editor now offers `structure` (single-step selection → split). AI re-segmentation from the
  source video remains the spec-optional opt-in ("re-segment only when explicitly requested")
  and is intentionally not built.
- **Test coverage:** `apps/engine/src/regenerate.test.ts` (the engine's first vitest suite) drives
  `handleRegenerateJob` with `@vitruvius/db` mocked and the offline Heuristic Instructor, asserting
  split (1 → 3 steps, midpoint window, fresh id, demoted to `edited`), merge (contiguous → spanning
  window + lowest confidence), and rejection of a non-contiguous merge. A `test-engine` CI job runs
  it under the `checks-pass` gate.

### Manual versioning — spec 17 — merged end-to-end (#44 engine/db/contract, #46 web)

- `@vitruvius/core`: `InstructionManual` gains `version` + `parentVersionId`; `JOB_TYPE`
  adds `enrich` (breaking contract change).
- `@vitruvius/db`: migration `0009` (manuals `version`/`parent_version_id` + lineage index;
  `enrich` job type; `save_manual` persists the new columns). `createManualVersion` copies a
  parent manual with fresh step ids and enqueues an `enrich` job; `listManualVersions` walks
  the lineage.
- `apps/engine`: claims `enrich`, re-maps BOM and re-illustrates on the existing step timeline
  (no re-segmentation), reusing the spec 13 / 14 agents.
- `apps/web` (#46): the end-to-end slice — an editor "Add BOM / digital model" action that
  stores the new files and calls `createManualVersion` (→ `enrich` job), a version switcher
  driven by `listManualVersions`, and the **freeze rule** (only the head of a lineage is
  editable; older versions are read-only but exportable, enforced server-side on
  `save`/`regenerate`/`enrich`). Shared upload helpers extracted to `lib/server/uploads.ts`.
- Integration coverage: `packages/db/src/e2e.test.ts` enriches a fixture v1 → v2 with a BOM
  file and asserts the spec's acceptance criteria — same timeline, populated `PartRef`,
  preserved human edits, a blocking BOM candidate, and a still-exportable frozen v1.

### Schematic PDF export (spec 09 phase-1 target) — implemented in renderer

- `packages/export/src/html.ts` already prefers the **schematic** path: `illustrationUrl ||
keyframeUrl` as the primary image and `caption || instruction` as on-page text, with unit
  coverage (`html.test.ts`: "prefers illustrationUrl over keyframeUrl", "prefers caption over
  instruction"). The Illustrator (spec 14) populates `illustrationUrl`, so a primed manual
  exports schematic images today.
- This corrects earlier notes that listed the schematic PDF as the outstanding phase-1 item — the
  template is built. The earlier keyframe-fallback divergence is **resolved**: the keyframe is no
  longer rendered as the primary schematic. When a step has no illustration yet (the Illustrator is
  non-fatal), the source frame renders as a clearly marked `figure.reference` ("illustration
  pending"), never as the finished diagram — satisfying spec 09's "schematic illustrations, not raw
  video keyframes" while still degrading gracefully. Covered by `html.test.ts` ("marks a
  keyframe-only step as a reference frame", "renders an illustrated step as a schematic").

## Phase 1+ slices (shipped)

### Auth + multi-tenancy — spec 15 — merged (#45)

- `@vitruvius/db`: migration `0010_auth_multi_tenant.sql` (tenancy columns + RLS scoping).
- `apps/web`: Supabase Auth wired through `hooks.server.ts`; routes for `login`, `logout`,
  `register`, `reset-password`, and an `auth` callback; manuals scoped per tenant.
- Supersedes the earlier "spec drafted" status — auth is implemented, not just specced.

### UI localization — en / it / es / fr — merged (#48)

- Paraglide (inlang) message catalogs under `apps/web/messages/{en,it,es,fr}.json`, a
  `LanguageSwitcher` component, and locale negotiation in `hooks.server.ts`.
- **No spec covers this** — it shipped ahead of the spec/decision layer; see
  [discrepancies](#decided-vs-developed--open-discrepancies).

## Cross-cutting / infra (shipped)

| Change                                                      | PR  | Notes                                                                           |
| ----------------------------------------------------------- | --- | ------------------------------------------------------------------------------- |
| CI runs DB tests against a live Supabase; harden Dockerfile | #37 | Engine image + DB test job hardening                                            |
| End-to-end integration testing flow                         | #38 | Cross-package process/enrich/export exercise                                    |
| Premium dark-theme polish (landing/editor/export)           | #39 | Visual polish; no contract change                                               |
| Engine vitest stack + `test-engine` CI job                  | —   | First `apps/engine` test suite (regenerate `structure`); gated by `checks-pass` |

## Decided vs developed — open discrepancies

Where the code on `main` and the **decided** spec/architecture diverge. Per the working rule, the
decision is preserved; the gap is recorded here for whoever closes it.

1. **Regenerate `structure` scope — RESOLVED.** Previously the engine threw for `structure`.
   It is now implemented (`apps/engine/src/regenerate.ts` → `restructureSteps`) as the editor's
   split/merge semantics applied engine-side, followed by an Instructor re-run on the affected
   step(s); the editor offers the scope. This realizes spec 16's "coordinate with editor
   operations." Covered by `apps/engine/src/regenerate.test.ts` (split / merge / non-contiguous
   reject) under the new `test-engine` CI job. The spec's _optional_ extra — AI re-segmentation
   from the source video ("re-segment only when explicitly requested") — is deliberately left
   unbuilt; that is a future opt-in, not a divergence, since the spec marks it optional.

2. **UI localization — RESOLVED.** The en/it/es/fr Paraglide stack is now fully documented in
   [spec 18](../../specs/18-i18n.md) and Decision 13 in `decisions.md`, resolving the earlier
   divergence. Intent and code are now aligned.

3. **Schematic export keyframe fallback — RESOLVED.** Spec 09's phase-1 target says the PDF uses
   `illustrationUrl` + `caption` with `keyframeUrl` "optional in appendix/debug only". The renderer
   previously fell back to `keyframeUrl` inline as if it were the schematic. It now renders the
   illustration as the only primary image; a keyframe-only step shows the source frame as a marked
   `figure.reference` ("illustration pending"), demoting it to reference/debug per the spec instead
   of presenting it as the finished diagram. The on-page text still uses `caption || instruction`,
   which is human-authored copy, not a raw frame — outside this divergence's scope.

4. **Stale code docstring — RESOLVED.** `packages/export/src/html.ts`'s function docstring no
   longer reads "Original keyframes lead each step"; it now describes the schematic-first render
   with the keyframe as a marked reference.

## Next vertical slices

Phase 1 core slices (13, 14, 16, 17) are implemented end-to-end, the spec 09 export gate
(`checkExportGate`) blocks unconfirmed steps / open BOM candidates, and the schematic export template
is in place (illustration-primary, keyframe demoted to a marked reference per spec 09), and the
regenerate `structure` scope is now wired (split/merge + Instructor). The remaining tracked work is
the discrepancy list above — chiefly retro-speccing localization (item 2) and the optional AI
re-segmentation opt-in noted under item 1. Phase 2 (Compositor-full / pose alignment) stays blocked
on research and must not block phase 1.

## Spec status matrix

| Spec                 | Status                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01-core              | Bootstrap done; PartRef extension merged (#33)                                                                                                                |
| 02-db                | Done; migrations 0006 (#33), 0007 (#34), 0008 (#41), 0009 (#44), 0010 (#45)                                                                                   |
| 03–07                | Done on `main`                                                                                                                                                |
| 08-web-editor        | **BOM disambiguation merged (#35/#43)** + spec 17 versioning trigger/switcher/freeze                                                                          |
| 09-export            | Gate + PDF done; **schematic template (illustrationUrl/caption) implemented**; keyframe-fallback divergence resolved (keyframe demoted to a marked reference) |
| 10–12                | Done on `main`                                                                                                                                                |
| 13-bom-map           | **Merged** (#34)                                                                                                                                              |
| 14-ai-illustrate     | **Tier 1 merged (#40)** (Illustrator + Compositor-lite); tier 2 blocked (phase 2)                                                                             |
| 15-auth-multi-tenant | **Merged (#45)** — auth + multi-tenancy implemented (was "spec drafted")                                                                                      |
| 16-regenerate-job    | **Merged (#41)** (text + illustration/layout); **`structure` split/merge wired + tested** (`test-engine`; AI re-segment opt-in unbuilt)                       |
| 17-manual-versioning | **Implemented** (lineage + `enrich` job + editor trigger/switcher/freeze)                                                                                     |
| 18-i18n              | **Localization en/it/es/fr merged (#48)** — retro-documented spec and Decision 13                                                                             |
