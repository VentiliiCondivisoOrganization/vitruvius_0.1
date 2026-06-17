# CLAUDE.md

Read `AGENTS.md` first — it contains the working rules for this repo.

This is Vitruvius: an MVP that turns assembly videos into editable, step-by-step
instruction manuals (AI draft + guided human editor — not a fully automatic generator).

Architecture: a SvelteKit web app and a separate containerized engine worker, in one
monorepo, communicating only via the database and the `@vitruvius/core` contract.

Start from `docs/ai/architecture.md` for the map and `specs/` for the task you were assigned.
Use Plan mode for any non-trivial task. Build vertical slices, not the whole app at once.
