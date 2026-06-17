# AGENTS.md — working rules for any agent in this repo

## Working style
- Before editing, inspect the relevant files and state the intended change.
- For non-trivial tasks, produce a short plan first; wait for approval before editing.
- Keep changes minimal and local to the assigned spec. No opportunistic refactors.
- Preserve existing architecture, naming, formatting, and public APIs.
- Do not introduce new dependencies unless the spec requires it or you get approval.
- All shared data shapes come from `@vitruvius/core`. Never redefine them locally.

## Architecture boundaries
- `apps/web` (SvelteKit) and `apps/engine` (worker) NEVER import each other.
- They communicate only through the database (jobs table + manual rows) and `@vitruvius/core`.
- ffmpeg, Gemini, and Playwright live in the engine, never in the web app.

## AI layer (see `docs/AI.md`)
- **Credits are a budget, spent under a quality bar.** Accuracy, confidence, and reliability come
  first; minimize credits within that, never above it — cut waste, not quality. Prefer the cheapest
  model that clears the bar; batch into one structured call over many round-trips; chunk only
  fast/ambiguous sections; cache on a content hash. Never call AI from the web app — model access
  lives in the engine, behind `packages/ai`, only.
- **Stay provider-pluggable.** No SDK import, model name, or API key may leak outside `packages/ai`.
  The pipeline depends on the agent interfaces (`segment`, `writeInstructions`, `critique`), never on
  a concrete provider. (Enables the future BYO-license self-host; out of MVP scope.)
- **Don't let the generator grade itself.** Accuracy review is the decoupled Critic (spec 10); it
  only recalibrates `confidence` and raises `critique` flags — it never rewrites instructions.
- **Capture learnings, don't inline them.** Reusable, core-scope knowledge goes to the learnings
  store (spec 11) to prime future runs — never hardcode domain heuristics in prompts or code.

## TypeScript
- Never use `any`. Use precise types, generics, or `unknown` with narrowing.
- Validate external/AI/untrusted data with the zod schemas in `@vitruvius/core`.

## SvelteKit notes
- Use server routes (`+server.ts`) and `+page.server.ts` load/actions for backend work.
- Client-exposed env vars use the `PUBLIC_` prefix; secrets stay server-side.

## Validation
- After changes run: `pnpm typecheck`, `pnpm lint`, and the smallest relevant test.
- Do not claim a command passed unless it was actually run.

## Output
- Summarise changed files, assumptions, and risks.
- Report the commands you ran and their results.

## Scope discipline
- One spec = one branch = one PR. Reference the spec file and issue in the PR.
- `docs/` and `specs/` are the source of truth. If reality diverges, update them in the same PR.
