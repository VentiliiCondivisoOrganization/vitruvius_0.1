# PR & CI

Everything an agent needs to open a green PR.

## 1. PR title

The repo follows [Conventional Commits](https://www.conventionalcommits.org/) with a
**required scope**: `type(scope): description`. The `pr-title` CI job rejects a scopeless
title. A lowercase description matches the repo's history but isn't enforced.

Examples:

- `feat(db): add manuals table`
- `fix(engine): retry the segment call on timeout`
- `ci(checks): require a scope in PR titles`
- `feat(core)!: rename the Manual.steps field` ← `!` marks a breaking change

### Types

`feat fix perf refactor style docs test chore build ci deps revert` — matching the
`pr-title` regex. Use `feat`/`fix` for user-visible change, `refactor` for behaviour-neutral
internal change, `ci`/`build` for workflow and tooling, `deps` for dependency bumps.

### Scope (required)

One of the workspace packages/apps — `core`, `db`, `web`, `engine`, `ai`, `media`,
`export` — or a short lowercase area such as `checks` / `deps` for infrastructure. Multiple
scopes may be comma-separated (`feat(web,engine): …`). Keep new scopes short and lowercase.

### Breaking changes

A change that breaks the `@vitruvius/core` contract or the database schema gets a `!`
before the colon (`feat(core)!: …`) and a `BREAKING CHANGE:` block in the body explaining
what callers/data must do to migrate.

## 2. PR body

Honor [`.github/pull_request_template.md`](../../.github/pull_request_template.md) — the
three headings `# Motivation` / `# Changes` / `# Validation`, with per-section guidance
embedded as comments in the template.

- **All three sections are required**, even for a tiny PR.
- **Use the exact headings** so downstream tooling can find them.
- **Concise but complete** — a reviewer should understand what changed and why without
  opening the diff. Motivation: 1–3 sentences. Changes: one bullet per logical change,
  outcome first.
- **Write what the diff can't say** — the why, the trade-offs, what was deliberately left
  out of scope. Don't narrate the diff line by line.
- **No filler** — drop openers like "This PR…".
- **`# Validation` is concrete** — name the commands you ran and their outcome, the tests
  added, the manual steps taken. "Tests pass" alone says nothing.
- **Do not hard-wrap lines.** One line per paragraph or bullet; the renderer wraps. (This
  is the PR body only — source files follow Prettier.)
- Call out any change to the `@vitruvius/core` contract, the DB schema, or the web⇄engine
  boundary, and any `docs/` or `specs/` updated in the same PR.

## 3. Atomicity

One logical change per PR; one spec per branch. If you catch yourself writing "and also" /
"while I was here", split it. CI and review get faster, and a revert stays surgical.

## 4. Local quality gates

From the repo root, before opening the PR:

```bash
pnpm format       # Prettier --write across the repo (cached)
pnpm lint         # ESLint per package via turbo (cached) — covers apps/web too
pnpm typecheck    # tsc per package via turbo
pnpm build        # turbo build
pnpm test         # the smallest relevant suite (some need a local service — see infra.md)
```

`pnpm format:check` is what CI runs (Prettier in `--check` mode); run `pnpm format` to fix.

## 5. CI jobs you must keep green

CI lives in [`.github/workflows/checks.yml`](../../.github/workflows/checks.yml). Each job
covers one concern and feeds the aggregate **`checks-pass`** job — the single status check
the `main` ruleset requires. Add or remove a job by editing only `checks-pass.needs`; the
branch-protection rule never changes.

| Job           | Runs                                                           |
| ------------- | -------------------------------------------------------------- |
| `pr-title`    | Validates the Conventional-Commit title (scope required).      |
| `format`      | `pnpm format:check` — Prettier, with a content cache.          |
| `lint`        | `pnpm lint` — ESLint per package via turbo (incl. `apps/web`). |
| `typecheck`   | `pnpm typecheck`.                                              |
| `build`       | `pnpm build`.                                                  |
| `test-media`  | `pnpm --filter @vitruvius/media test` — installs ffmpeg first. |
| `checks-pass` | Aggregator — fails if any needed job didn't succeed.           |

Tests are gated **per package**, not via the repo-wide `pnpm test`: a suite is added
as its own job once it runs without external services. `@vitruvius/media` qualifies
(it only needs the ffmpeg/ffprobe binaries, installed in the job). `@vitruvius/db`
does **not** yet — its Vitest run needs a live Supabase (Docker) instance (see
[`specs/02-db.md`](../../specs/02-db.md)), so it stays ungated until CI provisions one.

`main` is protected: PR-only, squash-only, review threads resolved, and gated by a **merge
queue**. The workflow runs on `pull_request` and `merge_group`, so keep both triggers.

**Every stack ships with CI.** When you add a new app/package or a non-JS toolchain (the
containerized engine, ffmpeg, Playwright, DB migrations, …) and no check covers it, add a
job in the same PR and wire it into `checks-pass.needs`. If it can't run in plain CI yet
(needs Docker or a live service), scaffold it commented-out with a note on what would enable
it, rather than leaving it unmentioned.

## 6. Formatting & linting

- **Prettier owns formatting; ESLint owns correctness.** `pnpm format` applies Prettier
  (`--write`, repo-wide, cached); `pnpm lint` runs ESLint per package via turbo (cached).
- Prettier config ([`.prettierrc`](../../.prettierrc)) is repo-wide and stack-aware: tabs,
  single quotes, no trailing comma, width 100; it formats every file type — TS/JS, JSON,
  Markdown, YAML, CSS — plus `.svelte` and `.sql` via plugins. `.prettierignore` only lists
  paths `.gitignore` can't (committed lockfiles); everything else is inherited from
  `.gitignore`, which Prettier honors by default.
- ESLint: the root flat config covers `packages/*` and `apps/engine`; `apps/web` ships its
  own config. `turbo run lint` runs each.
- New file type / stack? Cover it in the same PR — a Prettier plugin + `.prettierrc`
  override, and an ESLint config (or a package `lint` script) so `turbo run lint` picks it up.

## 7. After CI fails

- **`format` red** → run `pnpm format` locally and commit the result.
- **`lint` red** → run `pnpm lint`; fix, don't silence with `// eslint-disable` unless you
  can justify it in review.
- **`pr-title` red** → the title is missing a scope or uses an unknown type. Fix the title
  and push (a push re-runs the gate).
- **`checks-pass` red but children green** → the aggregator hit a transient/stale state;
  re-run the job or push a no-op commit.

## 8. Updating an existing PR

Add commits. **Never force-push or `--amend` a pushed PR branch** unless the user asks for
that exact operation by name — squash-merge tidies history at merge time, so a messier branch
is fine. To undo something, push a revert commit.
