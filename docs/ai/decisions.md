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
sequences. Implemented in `packages/ai`: each agent role has a Gemini provider calling the REST API,
with a deterministic heuristic fallback selected when `GEMINI_API_KEY` is absent (local dev / CI).

### 8. Quality first, then minimize credits; the AI layer is provider-pluggable (BYO future)

Accuracy, confidence, and reliability come first; credits are minimized _within_ that bar, never
above it — we cut waste, not quality. With that ordering fixed, AI calls are the dominant variable
cost, so credit optimization is a design constraint in every AI-touching spec, not an afterthought
(cheapest model that clears the bar, batch over round-trips,
chunk only what needs it, cache on content hash, attribute spend per manual). To keep the future
open, **all model access goes through `packages/ai`** and the pipeline depends on agent _interfaces_,
never a concrete provider — that seam later becomes an agent registry so a company can self-host,
choose which agents to run, and attach their own license/keys. The registry itself is **out of MVP
scope**; the MVP ships one hosted provider under our key. See [`ai-layer.md`](./ai-layer.md).

### 9. Accuracy review is a decoupled Critic agent

The generator is biased toward its own output, so it cannot honestly grade it. A separate **Critic**
agent (spec 10) with its own prompt — and optionally a cheaper model — reviews the draft against its
`sourceNotes`, recalibrates `confidence`, and raises concrete `critique` flags. It only scores and
flags; it never rewrites instructions. This keeps the human editor's trust signal independent of the
thing that produced the draft. In the spirit of a `/grill-me` reviewer: unbiased and relentless, but
no busywork on well-supported steps.

### 10. Meta-learning via a learnings store

Knowledge the pipeline discovers for its core scope (tool/part conventions, audio cues, recurring
warnings) — and especially confirmed human edits — is distilled into a `learnings` store (spec 11)
and injected back into future runs. This improves accuracy and cuts credits (the model reasons less
from scratch). Only reusable, generalizable heuristics are stored — never per-video transcripts.

### 11. Illustrated deliverable — two engineering phases

The [client alignment assessment](./client-alignment-assessment.md) (grill-me) commits the product
to IKEA/LEGO-style **schematic** output (`illustrationUrl`, structured BOM, export gate), not raw
video keyframes. Engineering delivers in **phase 1** (BOM layer, Illustrator, Compositor-lite,
regenerate job, versioning — specs 13, 14 tier 1, 16, 17) then **phase 2** (Compositor-full per-step
CAD overlay), which depends on video↔geometry pose alignment research outside spec 12. Phase 2 must
not block phase 1.

### 12. Critic stays text-only; BOM and images use other layers

The Critic (spec 10) continues to judge **`instruction` ↔ `sourceNotes` only**. BOM consistency,
`PartRef` ambiguity, and illustration quality are **not** Critic responsibilities — they use the
deterministic BOM layer (spec 13), editor resolution UX (spec 08, same pattern as `alternatives`),
and export gate rules (spec 09). Optional deterministic flags from `digitalModelStatus` (spec 12)
may run before the Critic but do not expand its prompt or scope.

### 13. UI Localization via Paraglide JS

The team selected Paraglide JS (inlang) as the UI localization framework. Paraglide's compile-time code generation provides type-safe key lookup, compile-time key validation, and minimal runtime bundle size by avoiding heavy runtime string parsing. To prevent translation drift and hardcoded UI leakage, we configure locale negotiation (`en`, `es`, `fr`, `it`) in server hooks and load routes, and enforce translation compliance via a static analysis linter (`scripts/check-i18n.js`) running in package build and lint tasks.

### 14. Node-based SvelteKit Adapter

For production deployment, SvelteKit is configured with `@sveltejs/kit/node` (`adapter-node`) to compile the web application into a standard Node.js server. This provides maximum compatibility with containerized deployment environments (such as Render, Fly.io, or Railway) matching the engine worker container's runtime, and avoids the runtime/V8-isolate limitations of serverless edge adapters.

