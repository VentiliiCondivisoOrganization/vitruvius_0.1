# Spec: 03-web-upload

**Goal:** The phase-1 vertical slice with no AI — upload a video and enqueue processing.
**Package/app(s):** `apps/web`, `packages/db`.
**Depends on:** 01-core, 02-db.

## Inputs

- A user-uploaded video file.
- `@vitruvius/core` types; `@vitruvius/db` queries + queue helpers.

## Outputs

- A stored video in Supabase Storage.
- A `manuals` row with status `uploaded`.
- A queued `process` job row.

## In scope

- A SvelteKit upload page + server route (`+page.server.ts` action or `+server.ts`).
- Store the file in Supabase Storage.
- Create the manual row (status `uploaded`) and `enqueueJob({ type: "process" })`.
- A processing-status page that reflects `manuals.status`.

## Out of scope

- Any media/AI processing.
- The engine itself (spec 07).
- The editor (spec 08) and export (spec 09).

## Acceptance criteria

- A user can upload a video.
- A manual row and a queued job appear in the database.
- The status page renders the manual's current status.

## Validation

- `pnpm --filter @vitruvius/web typecheck`
- `pnpm --filter @vitruvius/web lint`
- `pnpm --filter @vitruvius/web build`
- Manual run: upload a file, confirm the rows and the status page.
