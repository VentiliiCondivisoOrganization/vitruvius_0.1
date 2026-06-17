<!--
Style — applies to the whole body:
- Do NOT hard-wrap lines. One line per paragraph / bullet; GitHub wraps. Manual ~80-col wrapping breaks lists, quotes, and tables.
- Concise but complete: a reviewer should get what changed and why without opening the diff. Cut anything that doesn't change what the reviewer does next.
- No filler ("This PR…", "In this change…") and no diff narration — the diff is attached; write what it can't say (why, trade-offs, what was deliberately NOT done).
- Keep the exact three headings below — reviewers and tooling grep them.
Full rules: AGENTS.md § Pull requests.
-->

# Motivation

<!-- Why this change exists: the problem, product need, or spec it implements. 1–3 sentences. Link the spec (`specs/NN-*.md`) and the issue. -->

# Changes

<!-- One bullet per logical change, outcome first. Call out: changes to the `@vitruvius/core` contract, the DB schema / migrations, the web⇄engine boundary, and any `docs/` or `specs/` updated in the same PR. If you need "and also", the PR probably isn't atomic — split. -->

# Validation

<!-- How it was verified, concretely: commands run + their outcome (`pnpm typecheck` / `lint` / `build` / `test`), tests added, manual steps. "Tests pass" alone is not enough — say which. -->
