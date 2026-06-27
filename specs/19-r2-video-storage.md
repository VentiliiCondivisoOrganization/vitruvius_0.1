# Spec: 19-r2-video-storage

**Goal:** Store source videos in Cloudflare R2 (S3-compatible) instead of Supabase Storage, whose free-plan per-file upload cap is smaller than a real assembly video.
**Package/app(s):** `@vitruvius/db`, `apps/web` (upload), `apps/engine` (download)
**Depends on:** `02-db`, `03-web-upload`, `07-engine-worker`, `15-auth-multi-tenant`

## Inputs

- The uploaded source video (`File`) from the web upload action.
- Env vars (web + engine): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
- The stored video object key (`InstructionManual.videoUrl`).

## Outputs

- The video object persisted in the R2 bucket under the existing `<id>/source.<ext>` key.
- A short-lived presigned GET URL the engine fetches the video from.

## In scope

- An R2 storage module in `@vitruvius/db` (the only shared package the web app may import):
  `uploadVideo`, `presignVideoGet`, `deleteVideo`, `isR2Configured`, backed by
  `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, path-style.
- Web upload writes the video via `uploadVideo` and rolls it back via `deleteVideo`.
- Engine downloads the video via `presignVideoGet`.
- **Graceful fallback:** when R2 env is absent, all three helpers use the Supabase `videos`
  bucket, so local dev and tests run without R2 credentials.

## Out of scope

- **Moving BOM/CAD aux files or export PDFs off Supabase** — they are small and stay put.
- **Direct browser→R2 presigned-PUT upload** — would remove large bodies from the web
  server entirely (and is the cleaner long-term shape), but is a separate web change; this
  spec keeps the existing server-proxied form action (sized by the `fly.web.toml` body limit).
- **Migrating already-uploaded Supabase videos** — dev data is disposable; new uploads use R2.
- **Multipart/resumable upload** — a single presigned PUT/PutObject covers the expected sizes.

## Acceptance criteria

- With R2 env set, an uploaded video lands in the R2 bucket and the engine processes it to
  `ready` without touching the Supabase `videos` bucket for the video.
- With R2 env unset, upload + download fall back to Supabase (unchanged behaviour).
- `isR2Configured` is true only when all four R2 vars are present.
- `presignVideoGet` returns a signed URL for the bucket/key (offline-verifiable).
- BOM/CAD aux files and export PDFs continue to use Supabase Storage.

## Validation

- `pnpm --filter @vitruvius/db exec vitest run src/storage.test.ts` (offline routing + presign).
- `pnpm typecheck`, `pnpm lint`, `pnpm --filter @vitruvius/web build`.
- Live: set the four R2 secrets on both Fly apps, upload a >50MB video, confirm the manual
  reaches `ready` and the object exists in the R2 bucket.
