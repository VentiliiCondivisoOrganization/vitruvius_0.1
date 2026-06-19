# Infrastructure

How the services connect, and which environment variable each one consumes. The canonical list of
env vars lives in [`.env.example`](../../.env.example).

## Services

### Web — `apps/web` (SvelteKit)

- Deployable to Vercel (`adapter-vercel`) or any Node host (`adapter-node`). The bootstrap ships
  `adapter-auto`; swap it at deploy time.
- Reads `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` client-side (the `PUBLIC_` prefix
  exposes them to the browser). Server routes may additionally use the service-role key, but secrets
  never reach the client.

### Engine — `apps/engine` (container)

- A long-running worker built from `apps/engine/Dockerfile` (Node LTS + ffmpeg + Chromium system
  libs). Deployable to any container host (Railway / Render / Fly.io / etc.), scaled independently
  of the web app.
- Reads `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` server-side only, plus
  `ENGINE_POLL_INTERVAL_MS` to pace its polling.

### Supabase

- **Postgres** — stores `manuals`, `steps`, `jobs`, and `learnings` (the meta-learning store,
  spec 11 — reusable domain heuristics, written at end-of-run and from confirmed editor edits).
- **Storage** — stores uploaded videos, extracted keyframes, and exported PDFs.
- **Auth** — user authentication for the web app.

### Job queue

- The `jobs` table in Postgres **is** the queue. The engine claims work with
  `SELECT ... FOR UPDATE SKIP LOCKED`, so multiple engine instances can run concurrently without
  double-processing. **No Redis, no third-party queue.** The lock lives in the `claim_next_job`
  Postgres function (`packages/db`), called via `.rpc()` — PostgREST can't issue row-locking selects.

### Local development (Supabase)

- The `supabase` CLI ships as a repo devDependency (no global install). The local stack runs in
  Docker; the schema lives as versioned SQL in `packages/db/supabase/migrations/`.
- From `packages/db`: `pnpm db:start` (boot the stack), `pnpm db:reset` (apply migrations), `pnpm
db:stop`. Get the local URL + keys with `pnpm supabase status`. The same migrations apply to a
  hosted project at deploy time (`supabase link` + `db push`).

### Google Gemini

- Runtime AI for video understanding (segmentation, instruction writing), called from the engine
  only via `packages/ai` and `GEMINI_API_KEY`. The **Segmenter** (spec 05) uses Gemini when a key is
  present; otherwise it degrades to ffmpeg scene-boundary heuristics for local dev and CI.

## Environment variables

| Var                         | Consumed by           | Purpose                                                    |
| --------------------------- | --------------------- | ---------------------------------------------------------- |
| `PUBLIC_SUPABASE_URL`       | web (client + server) | Supabase project URL                                       |
| `PUBLIC_SUPABASE_ANON_KEY`  | web (client + server) | Public anon key for browser clients                        |
| `SUPABASE_SERVICE_ROLE_KEY` | engine (server)       | Privileged DB/Storage access for the worker                |
| `GEMINI_API_KEY`            | engine → `packages/ai` | Gemini calls (segment, instructions, critic)            |
| `GEMINI_SEGMENT_MODEL`      | engine → `packages/ai` | Optional segment model override (default `gemini-2.0-flash`) |
| `ENGINE_POLL_INTERVAL_MS`   | engine                | Poll cadence for claiming jobs (default 2000)              |

## AI cost & configuration (mostly future)

- **Credit attribution.** Each AI call should be attributable to a `manualId` so credit spend per
  manual is observable — you can't optimize what you don't count. See [`ai-layer.md`](./ai-layer.md).
- **Agent registry (out of MVP scope).** Today the engine uses one provider (Gemini) under
  `GEMINI_API_KEY`. The future self-host/BYO model resolves each agent role (Segmenter / Instructor /
  Critic) to a provider + model + credential from a startup config; that config and its env vars land
  with their own spec. Nothing in the MVP should assume a single hardcoded provider beyond
  `packages/ai`.
