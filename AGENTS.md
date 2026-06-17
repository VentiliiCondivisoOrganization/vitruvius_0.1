# AGENTS.md — working rules for any agent in this repo

> Read this first; it's short on purpose. Deeper docs live in
> [`docs/ai/`](docs/ai/README.md) — architecture, the AI layer, infra, decisions, and the
> full [PR & CI rules](docs/ai/pr-and-ci.md).

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

## AI layer (see `docs/ai/ai-layer.md`)

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

- After changes run: `pnpm format`, `pnpm lint`, `pnpm typecheck`, and the smallest relevant test.
- Do not claim a command passed unless it was actually run.

## PR, CI & formatting

Full rules in [`docs/ai/pr-and-ci.md`](docs/ai/pr-and-ci.md). In short:

- **PR title**: Conventional Commit with a **required scope** — `type(scope): summary`
  (e.g. `feat(db): add manuals table`). The `pr-title` CI job enforces it; a `!` plus a
  `BREAKING CHANGE:` block marks a break to the `@vitruvius/core` contract or DB schema.
- **PR body**: the three headings from [`.github/pull_request_template.md`](.github/pull_request_template.md)
  (`# Motivation` / `# Changes` / `# Validation`), all filled; don't hard-wrap; don't narrate the diff.
- **Formatting/linting**: `pnpm format` (Prettier, repo-wide) and `pnpm lint` (ESLint per package
  via turbo, incl. `apps/web`). Both are cached and CI-gated.
- **CI** ([`.github/workflows/checks.yml`](.github/workflows/checks.yml)): per-concern jobs feed
  the aggregate **`checks-pass`** gate — the only required status check, so add/remove jobs via
  its `needs:` list, never the ruleset. `main` is PR-only, squash-only, merge-queue-gated. Every
  new stack ships with a CI job in the same PR.
- **One logical change per PR.** Never force-push or amend a pushed PR branch unless explicitly asked.

## Output

- Summarise changed files, assumptions, and risks.
- Report the commands you ran and their results.

## Scope discipline

- One spec = one branch = one PR. Reference the spec file and issue in the PR.
- `docs/` and `specs/` are the source of truth. If reality diverges, update them in the same PR.
