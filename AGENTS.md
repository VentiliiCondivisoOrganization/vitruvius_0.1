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

- **Credits are a budget.** Prefer the cheapest model that clears the bar; batch into one structured
  call over many round-trips; chunk only fast/ambiguous sections; cache on a content hash. Never call
  AI from the web app — model access lives in the engine, behind `packages/ai`, only.
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

## Formatting & linting

- **Prettier owns formatting; ESLint owns correctness.** `pnpm format` applies Prettier
  (`--write`, repo-wide, cached); `pnpm lint` runs ESLint per package via turbo (cached).
- Prettier config is repo-wide and stack-aware: `.prettierrc` (tabs, single quotes, no trailing
  comma, width 100) formats every file type — TS/JS, JSON, **Markdown**, YAML, CSS — plus
  `.svelte` and `.sql` via plugins as those stacks land. Don't add per-package Prettier configs.
- ESLint is the opposite: the root flat config covers `packages/*` and `apps/engine`; `apps/web`
  ships its own (SvelteKit) config. `turbo run lint` runs each, so web is linted too.
- New file type / stack? Cover it in the same PR — a Prettier plugin + `.prettierrc` override for
  formatting, and an ESLint config (or a package `lint` script) so `turbo run lint` picks it up.
- CI gates each separately: the `format` job runs `pnpm format:check`, the `lint` job runs
  `pnpm lint`. Both must be green (they feed `checks-pass`).

## Validation

- After changes run: `pnpm format`, `pnpm lint`, `pnpm typecheck`, and the smallest relevant test.
- Do not claim a command passed unless it was actually run.

## CI (`.github/workflows/checks.yml`)

- One job per concern (`pr-title`, `lint`, `typecheck`, `build`, …), each set up via the
  `prepare` composite action (pnpm + Node from `.node-version` + frozen install).
- They all feed one aggregate job, **`checks-pass`** — the single status check the `main`
  ruleset requires. Add or drop a job by editing only its `needs:` list; never change the
  branch-protection rule to match.
- `main` is protected: PR-only, squash-only, threads resolved, and gated by a **merge queue**.
  The workflow runs on `pull_request` _and_ `merge_group`, so keep both triggers when editing it.
- **Every stack gets CI before it lands.** When you add a new app/package or a non-JS toolchain
  (Docker engine worker, ffmpeg, Playwright, DB migrations, …) and no check covers it yet, add a
  job for it in the same PR and wire it into `checks-pass.needs`. A stack with no CI is incomplete.
  If a check can't run in plain CI yet (needs Docker/a live service), scaffold it commented-out
  with a note on what would enable it, rather than leaving it unmentioned.

## Pull requests

- **Title is a Conventional Commit with a lowercase description**: `type(scope): summary`
  — e.g. `feat(db): add manuals table`, `ci: structure checks workflow`. Match the repo's
  existing history; the `pr-title` CI job enforces the shape.
  - Types: `feat fix perf refactor style docs test chore build ci deps revert`.
  - **Scope is required** (the `pr-title` job rejects a scopeless title): a package/app name
    (`core`, `db`, `web`, `engine`, `ai`, `media`, `export`), `ci` for infra, `deps` for bumps,
    or a short lowercase area.
  - A change that breaks the `@vitruvius/core` contract or the DB schema gets a `!`
    (`feat(core)!: …`) and a `BREAKING CHANGE:` block in the body.
- **Body follows [`.github/pull_request_template.md`](.github/pull_request_template.md)** — the
  exact headings `# Motivation` / `# Changes` / `# Validation`, all three filled in even for a
  tiny PR. Write what the diff can't say (the why, trade-offs, what you left out of scope); don't
  narrate the diff and don't hard-wrap lines. `# Validation` names the commands you actually ran.
- **One logical change per PR** (see Scope discipline). If you're writing "and also", split.
- **Never force-push or amend a pushed PR branch** unless the user asks for that exact operation
  by name. Add a new commit instead — squash-merge tidies history at merge time.

## Output

- Summarise changed files, assumptions, and risks.
- Report the commands you ran and their results.

## Scope discipline

- One spec = one branch = one PR. Reference the spec file and issue in the PR.
- `docs/` and `specs/` are the source of truth. If reality diverges, update them in the same PR.
