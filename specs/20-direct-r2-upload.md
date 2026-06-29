# Spec: 20-direct-r2-upload

**Goal:** Upload the source video straight from the browser to R2 with a multipart presigned flow, so large videos never pass through (or buffer in) the web server.
**Package/app(s):** `@vitruvius/db` (R2 multipart helpers), `apps/web` (sign endpoints + upload UI)
**Depends on:** `03-web-upload`, `15-auth-multi-tenant`, `19-r2-video-storage`

## Background

Spec 19 stored videos in R2 but kept the server-proxied form action: the browser POSTs
the whole video to the SvelteKit server, which buffers it in memory (`adapter-node`) and
re-uploads it to R2. That caps uploads twice — at `BODY_SIZE_LIMIT` (413 above it) and at VM
memory — so a multi-GB video is rejected. This spec removes the server from the video byte
path. The video is uploaded directly to R2 in parts; the server only signs the parts and then
finalises the manual once the bytes are in R2. A single presigned PUT tops out near R2's ~5 GB
PutObject limit, so this uses **multipart** to support arbitrarily large videos.

## Inputs

- The video `File` chosen in the browser (`name`, `type`, `size`).
- Env vars (web): the four `R2_*` from spec 19. The browser only ever sees presigned URLs.
- The optional BOM/CAD aux files (unchanged — small, still server-proxied to Supabase).

## Outputs

- The video object in R2 under the existing `<id>/source.<ext>` key, written by the browser.
- An `InstructionManual` row + `process` job, created by the finalise action (as today).

## In scope

- R2 multipart helpers in `@vitruvius/db` (R2-only, no Supabase equivalent):
  `createMultipartUpload`, `presignUploadParts`, `completeMultipartUpload`,
  `abortMultipartUpload`, `headVideo`.
- Web sign endpoints under `/api/uploads/{create,sign,complete,abort}` — session-guarded,
  enabled only when R2 is configured, untrusted bodies validated.
- The home upload form uploads the video directly to R2 (chunked, with a progress bar), then
  submits the existing action with the resulting object key instead of the video bytes.
- The finalise action verifies the uploaded object exists (`headVideo`) before creating the
  manual, so a client cannot register a key it did not actually upload.
- **Graceful fallback:** when R2 is unconfigured (local dev/tests), the form keeps today's
  server-proxied `uploadVideo` path unchanged.

## Out of scope

- **Resumable/retryable parts across page reloads** — a failed upload is aborted and restarted,
  not resumed.
- **Moving BOM/CAD aux files or export PDFs off the server** — still small, still Supabase.
- **Raising `BODY_SIZE_LIMIT`** — it now only bounds the aux/fallback path, so it stays as-is.

## Acceptance criteria

- With R2 configured, a multi-GB video uploads directly to R2 (no 413, no server buffering) and
  the manual reaches `ready`; the web server never receives the video bytes.
- With R2 unconfigured, upload still works through the server action (spec 19 behaviour).
- The sign endpoints reject unauthenticated callers (401) and reject when R2 is off (409).
- The finalise action rejects a `videoKey` that does not exist in R2 or does not match its `id`.
- `createMultipartUpload`/`presignUploadParts` are offline-verifiable (presign is pure crypto).

## Validation

- `pnpm --filter @vitruvius/db exec vitest run src/storage.test.ts` (offline presign + routing).
- `pnpm typecheck`, `pnpm lint`, `pnpm --filter @vitruvius/web build`.
- R2 bucket CORS must allow `PUT` from the app origin and expose `ETag` (see
  `scripts/set-r2-cors.mjs`).
- Live: with R2 secrets + CORS set, upload a multi-GB video and confirm the object lands in R2
  and the manual reaches `ready`.

## Implementation notes

- **Status: implemented** (browser→R2 multipart helpers in `@vitruvius/db`, the
  `/api/uploads/{create,sign,complete,abort}` endpoints, and the direct-upload UI in
  `apps/web/src/routes/+page.svelte`). Hardened post-merge: presigned checksum dropped and
  orphaned parts reaped (#83), and parts signed just-in-time so a long upload can't outlive a
  presigned URL (#85).
- **Concurrent part uploads (client).** `uploadParts` streams parts through a bounded worker
  pool (`UPLOAD_CONCURRENCY = 4`) instead of one part at a time. The sequential version left a
  single connection unable to saturate the uplink and idled the link during every per-part
  signing round-trip, so large videos crawled and the progress bar appeared to freeze at each
  part boundary. Parts are still signed individually just before their own PUT (#85's reasoning
  holds — the sign TTL must outlive one part's transfer, which under concurrency shares the
  uplink with its siblings). Each part gets a few transient-failure retries so one dropped
  chunk can't abort a multi-GB upload; once a part fails for good the pool stops claiming new
  parts and the whole multipart upload is aborted by the caller. Progress is summed from a
  per-part byte map so it stays correct across concurrent and retried parts. This is purely a
  client change — the sign endpoints and the multipart contract are unchanged.
