# Infrastructure

How the services connect, and which environment variable each one consumes. The canonical list of
env vars lives in [`.env.example`](../.env.example).

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
- **Postgres** — stores `manuals`, `steps`, and `jobs`.
- **Storage** — stores uploaded videos, extracted keyframes, and exported PDFs.
- **Auth** — user authentication for the web app.

### Job queue
- The `jobs` table in Postgres **is** the queue. The engine claims work with
  `SELECT ... FOR UPDATE SKIP LOCKED`, so multiple engine instances can run concurrently without
  double-processing. **No Redis, no third-party queue.**

### Google Gemini
- Runtime AI for video understanding (segmentation + instruction writing), called from the engine
  only via `GEMINI_API_KEY`. Not wired in the bootstrap — stubbed in `packages/ai`.

## Environment variables

| Var | Consumed by | Purpose |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | web (client + server) | Supabase project URL |
| `PUBLIC_SUPABASE_ANON_KEY` | web (client + server) | Public anon key for browser clients |
| `SUPABASE_SERVICE_ROLE_KEY` | engine (server) | Privileged DB/Storage access for the worker |
| `GEMINI_API_KEY` | engine (server) | Gemini video understanding |
| `ENGINE_POLL_INTERVAL_MS` | engine | Poll cadence for claiming jobs (default 2000) |
