# Go-live checklist

What stands between the current codebase and a **running, operational web app**.

> **How to read this.** Phase-1 features (specs 01–18) are implemented and green
> (`pnpm typecheck` 14/14, `pnpm lint` 8/8, `pnpm build` 8/8, all **unit/component** suites pass). The
> remaining work to reach production is overwhelmingly **infrastructure provisioning, deployment, and
> end-to-end validation** — not feature development. This file tracks that gap. For feature/spec
> status see [`implementation-progress.md`](implementation-progress.md); for service wiring see
> [`infra.md`](infra.md).
>
> **Caveat on "green" (verified 2026-06-25, on `main` @ a3ed821).** Locally the integration suites
> (`@vitruvius/db` `e2e.test.ts`, `jobs.concurrency.test.ts`) and the ffmpeg-backed `@vitruvius/media`
> suite **self-skip** when no live Supabase / no `ffmpeg` is present. **In CI they do run and pass**:
> the `test-db` job spins up a local Supabase stack (`supabase start` + `db reset`) and the
> `test-media` job installs ffmpeg — the latest `main` Checks run is green. What is **genuinely never
> exercised** is (a) a real **deployed-stack** end-to-end run (engine container + Gemini + Storage +
> Auth + Playwright PDF — see **D**), and (b) the CAD canonical-view **render** path: the `render-cad`
> CI job is commented out (needs a CAD kernel in the engine image), so that test only self-skips.

## Done (code / features)

- [x] `@vitruvius/core` contract; engine pipeline (media → segment → instruct → critic → illustrate →
      learnings → save); guided editor; HTML→PDF export; BOM layer; `regenerate` job; manual
      versioning; auth + multi-tenancy; UI localization (en/it/es/fr).
- [x] AI wired to **Gemini** over REST (`generativelanguage.googleapis.com`) behind a provider
      interface, with a deterministic **heuristic fallback** when `GEMINI_API_KEY` is absent. (Note:
      the README's "stubbed in this bootstrap" line is stale — the Gemini path is real.)
- [x] DB migrations `0001–0010` present (incl. Storage buckets `videos` `0002`, `exports` `0005`;
      multi-tenant RLS `0010`).
- [x] `typecheck` 14/14, `lint` 8/8, unit/component tests green (export, cad, engine, ai, media).

## A. Supabase provisioning (Partially completed)

- [x] Create a **hosted Supabase project** (Postgres + Storage + Auth).
- [x] Apply migrations: `supabase link` + `supabase db push` (`0001–0010`).
- [x] Verify/create **Storage buckets**: `videos`, `exports` (from migrations) are confirmed to exist.
- [ ] Configure **Auth** in the dashboard: enable email/password; set **Site URL + Redirect URLs**
      (the `/auth` callback and `/reset-password`); email templates; **SMTP** for real delivery of
      registration / reset emails.
- [ ] Confirm **RLS** (`0010`) actually isolates data per tenant with real rows.
- [x] Obtain keys: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Obtain `GEMINI_API_KEY` (without it the app runs but produces **heuristic / placeholder**
      manuals, not real AI illustrations).

## B. Engine deployment (the worker — nothing processes without it)

- [ ] Build and **deploy the engine container** (`apps/engine/Dockerfile`) to a container host
      (Railway / Render / Fly.io).
- [ ] Confirm the image contains **ffmpeg + Chromium/Playwright** (needed for media + PDF) and builds.
- [ ] Set engine env: `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `ENGINE_POLL_INTERVAL_MS`.
- [ ] Ensure the **poll loop runs continuously** (long-running process, restart policy).

## C. Web app deployment

- [x] Swap `adapter-auto` → `adapter-vercel` or `adapter-node` for the chosen host.
- [ ] Deploy the web app with `PUBLIC_*` env vars.
- [ ] Domain + HTTPS + redirect URLs consistent with the Auth config.

## D. End-to-end validation (the real "operational" proof — not verified today)

- [ ] Full happy path on the deployed stack: **upload video → engine claims job → manual `ready` →
      editor → confirm → export → download PDF**.
- [ ] Real **auth** flow (register, login, reset email actually delivered).
- [ ] With `GEMINI_API_KEY`: assess **AI output quality** against the client bar ("printable without
      manual retouching") — there is no measured quality gate today.
- [ ] Run the DB integration / e2e suites (`@vitruvius/db`) against the **hosted** Supabase. They
      already pass in CI against a local Supabase stack (`test-db` job) and self-skip on a bare local
      machine — what is unproven is the same suites against the real provisioned project.

## E. Operational hardening (to be _operational_, not just "works once")

- [ ] Engine **observability**: today the worker only `console.log`/`console.error`s
      (`apps/engine/src/index.ts`). No structured logging, no error tracking (Sentry/etc.), no alert
      or surfaced view of `failed` jobs. Add at least failure visibility before launch.
- [ ] **Job retry / dead-letter — confirmed MISSING.** In `apps/engine/src/index.ts` a job that
      throws is marked `failed` **permanently** via `failJob` (sets `status='failed'`, records
      `last_error`); `claim_next_job` (migration `0001`) only ever re-claims `status='queued'` rows.
      An `attempts` column exists and is incremented on each claim, but **nothing reads it** to drive
      a retry/backoff — it is a claim counter, not a retry policy. A transient error (network, Gemini
      timeout) burns the manual with no recovery. Decide on at least a bounded retry before go-live.
- [ ] **Orphaned `running` jobs — no reaper.** `claim_next_job` flips a job to `running` but only
      ever claims `queued`; if a worker crashes mid-job the row is stranded in `running` forever (no
      visibility timeout, no requeue of stale `running` rows). Add a reaper or lease-expiry sweep.
- [ ] Storage **lifecycle** (videos are large: retention / cleanup).
- [ ] **Gemini cost controls** (per-`manualId` credit attribution is marked "future" in
      [`ai-layer.md`](ai-layer.md)).
- [ ] DB backups; production secrets management.

## Known product gaps (not blockers for the Phase-1 deliverable)

- Phase 2 **Compositor-full** (per-step CAD overlay) not built — blocked on pose-alignment research.
- i18n was shipped ahead of its spec; now retro-documented in [`specs/18-i18n.md`](../../specs/18-i18n.md).
- Doc drift: README / `decisions.md` still describe the AI as "stubbed" — it is now wired to Gemini.

---

**In one line:** little is missing in _code_; what's missing is **Supabase provisioning + two deploys
(web and engine) + a real end-to-end run** to go from "green build" to "operational web app". The
first concrete blockers are **A** (Supabase) and **B** (engine): without those two the web app boots
but can neither store nor process anything.

**Two things this list previously under-weighted** (added 2026-06-25 readiness review): (1) the **AI
output quality gate (D)** is a _product_ risk, not just an infra checkbox — without a Gemini key and a
measured pass against "printable without retouching", the deliverable is unproven; (2) **job retry /
dead-letter (E) is missing, not merely unverified** — failed jobs are terminal today. Treat both as
go-live decisions, not post-launch polish.
