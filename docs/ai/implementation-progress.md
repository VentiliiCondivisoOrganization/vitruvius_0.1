# Implementation progress

Living summary of vertical slices shipped or in review. Update this file when a spec lands.

_Last updated: 2026-06-24 (spec 15 auth + multi-tenancy merged #45; UI localization en/it/es/fr
merged #48; CI hardened against live Supabase + Dockerfile #37; end-to-end integration flow #38;
premium dark-theme polish #39. Earlier: spec 14 tier 1 #40; spec 16 regenerate #41; spec 17
versioning #44/#46 + enrich integration test #47; spec 13 #34; spec 08 BOM disambiguation #35/#43)._

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
  **`structure` scope is deferred** (`regenerate.ts` throws) — decided in spec 16 but not yet
  developed; see [discrepancies](#decided-vs-developed--open-discrepancies).

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
  template is built. One **minor divergence** from spec 09 remains (keyframe used as a live
  fallback rather than appendix-only); see
  [discrepancies](#decided-vs-developed--open-discrepancies).

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

| Change                                                      | PR  | Notes                                        |
| ----------------------------------------------------------- | --- | -------------------------------------------- |
| CI runs DB tests against a live Supabase; harden Dockerfile | #37 | Engine image + DB test job hardening         |
| End-to-end integration testing flow                         | #38 | Cross-package process/enrich/export exercise |
| Premium dark-theme polish (landing/editor/export)           | #39 | Visual polish; no contract change            |

## Decided vs developed — open discrepancies

Where the code on `main` and the **decided** spec/architecture diverge. Per the working rule, the
decision is preserved; the gap is recorded here for whoever closes it.

1. **Regenerate `structure` scope — decided, not developed.** Spec 16 lists four scopes
   (`text` | `illustration` | `layout` | `structure`); the engine implements the first three and
   `apps/engine/src/regenerate.ts` **throws** for `structure` ("not supported yet"). Split/merge is
   covered editor-side (spec 08) today; engine-side structural regen / re-segmentation is the open
   piece. **Action:** implement the scope, or amend spec 16 to formally scope it out of the MVP.

2. **UI localization — developed, not decided.** The en/it/es/fr Paraglide stack (#48) has no spec
   under `specs/` and no entry in `decisions.md`. It is real, shipped product surface. **Action:**
   retro-document it (a spec or an ADR for the i18n stack + supported locales), so intent and code
   agree. Until then it is intentionally listed only here.

3. **Schematic export keyframe fallback — minor divergence.** Spec 09's phase-1 target says the
   PDF uses `illustrationUrl` + `caption` with `keyframeUrl` "optional in appendix/debug only". The
   renderer instead falls back to `keyframeUrl`/`instruction` inline when an illustration/caption is
   absent. This is a reasonable degrade-gracefully choice, but it is not what the spec text states.
   **Action:** either accept the fallback in spec 09, or move keyframes to an appendix per the spec.

4. **Stale code docstring (not a doc file, noted for cleanup).** `packages/export/src/html.ts`'s
   function docstring still reads "Original keyframes lead each step", which predates the schematic
   change above. Harmless, but worth correcting next time that file is touched.

## Next vertical slices

Phase 1 core slices (13, 14, 16, 17) are implemented end-to-end, the spec 09 export gate
(`checkExportGate`) blocks unconfirmed steps / open BOM candidates, and the schematic export template
is in place. The remaining tracked work is the discrepancy list above — chiefly the regenerate
`structure` scope (item 1) and retro-speccing localization (item 2). Phase 2 (Compositor-full / pose
alignment) stays blocked on research and must not block phase 1.

## Spec status matrix

| Spec                 | Status                                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 01-core              | Bootstrap done; PartRef extension merged (#33)                                                                                                  |
| 02-db                | Done; migrations 0006 (#33), 0007 (#34), 0008 (#41), 0009 (#44), 0010 (#45)                                                                     |
| 03–07                | Done on `main`                                                                                                                                  |
| 08-web-editor        | **BOM disambiguation merged (#35/#43)** + spec 17 versioning trigger/switcher/freeze                                                            |
| 09-export            | Gate + keyframe PDF done; **schematic template (illustrationUrl/caption) implemented** (minor keyframe-fallback divergence — see discrepancies) |
| 10–12                | Done on `main`                                                                                                                                  |
| 13-bom-map           | **Merged** (#34)                                                                                                                                |
| 14-ai-illustrate     | **Tier 1 merged (#40)** (Illustrator + Compositor-lite); tier 2 blocked (phase 2)                                                               |
| 15-auth-multi-tenant | **Merged (#45)** — auth + multi-tenancy implemented (was "spec drafted")                                                                        |
| 16-regenerate-job    | **Merged (#41)** (text + illustration/layout; **structure deferred — throws**)                                                                  |
| 17-manual-versioning | **Implemented** (lineage + `enrich` job + editor trigger/switcher/freeze)                                                                       |
| _(no spec)_ i18n     | **Localization en/it/es/fr merged (#48)** — unspecced; see discrepancies                                                                        |
