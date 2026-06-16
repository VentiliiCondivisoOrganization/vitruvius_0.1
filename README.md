# Vitruvius

Vitruvius turns a **video of an assembly process** into an **editable, step-by-step instruction
manual** (IKEA-style). The positioning is deliberate: *AI-generated draft instructions with a guided
human revision editor* — not a fully automatic generator. Every AI output carries a confidence value
and source notes, and a human confirms or corrects each step before export.

## Stack

| Concern | Choice |
|---|---|
| Language | TypeScript everywhere |
| Monorepo tooling | pnpm workspaces + Turborepo |
| Web app | SvelteKit + Tailwind + shadcn-svelte |
| Processing engine | `apps/engine` — standalone containerized worker (own deploy/scale cadence) |
| Job queue | Postgres-backed `jobs` table in Supabase (`FOR UPDATE SKIP LOCKED`) — no Redis |
| Database | Supabase Postgres |
| File storage | Supabase Storage |
| Auth | Supabase Auth |
| Video processing | ffmpeg (inside the engine container) |
| AI runtime | Google Gemini (video understanding) — stubbed in this bootstrap; credit-aware and provider-pluggable behind `packages/ai` (see [`docs/AI.md`](docs/AI.md)) |
| PDF export | HTML template + Playwright print-to-PDF (inside the engine container) |
| Node | current active LTS |

## The web / engine boundary

`apps/web` (SvelteKit) and `apps/engine` (worker) never import each other — they communicate only
through the database (the `jobs` table + manual rows) and the shared `@vitruvius/core` contract. This
is a deploy boundary, so the engine can later be rewritten in Python / on GPUs or extracted to its
own repo without touching the web app.

## Getting started

```bash
pnpm install
cp .env.example .env   # fill in Supabase + Gemini values
pnpm dev               # turbo runs the web app (and engine) in dev
```

Useful workspace scripts: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`.

## Layout

- `packages/core` — the frozen contract (types + zod schemas + enums).
- `packages/{db,media,ai,export}` — typed stubs, implemented per spec.
- `apps/web` — SvelteKit UI + thin server routes.
- `apps/engine` — the containerized worker.

## Docs & specs

- Architecture map: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- The AI layer (agents, credit budget, Critic, learnings, BYO-license future): [`docs/AI.md`](docs/AI.md)
- Infrastructure & env vars: [`docs/INFRA.md`](docs/INFRA.md)
- Decisions (ADR-lite): [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Task specs: [`specs/`](specs/) — one vertical slice per file (`01`–`11`).
