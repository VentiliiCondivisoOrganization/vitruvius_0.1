# Decisions (ADR-lite)

Resolved decisions for the MVP foundation. Each is one short paragraph; revisit only with a reason.

### 1. Monorepo over polyrepo
The product hinges on one shared contract (`@vitruvius/core`). A monorepo keeps that contract in one
place and gives agents full context across web, engine, and packages. A repo boundary is not a
deploy boundary — services still ship independently.

### 2. TypeScript end to end (for now)
One language makes the shared-types contract and multi-agent hand-offs work; no Python yet. The
engine boundary is kept deliberately clean so the engine can be rewritten in Python / on GPUs later
without touching the web app.

### 3. SvelteKit for the web app
Chosen by the team; paired with Tailwind + (optionally) shadcn-svelte. Tradeoff: less agent training
data than React, mitigated by a strong `AGENTS.md` and tight specs.

### 4. Engine as a standalone deployable service inside the monorepo
`apps/engine` ships as its own container with its own scaling cadence, communicating with the web
app only via the jobs table and the `@vitruvius/core` contract. This makes a future language change
or repo extraction cheap.

### 5. Postgres-backed job queue (Supabase) instead of Redis / Trigger.dev
The engine polls a `jobs` table with `FOR UPDATE SKIP LOCKED`. No extra vendor, and the engine fully
owns its own runtime and scaling.

### 6. Supabase Storage over Cloudflare R2 for MVP
One vendor for DB + Storage + Auth keeps the surface small. Revisit if egress costs matter.

### 7. Gemini for video understanding
Verify the exact current model name before implementing `packages/ai`; chunk clips for fast action
sequences. Real calls are stubbed in the bootstrap.
