# Spec: 15-auth-multi-tenant

**Goal:** Implement user authentication and multi-tenant isolation to secure manuals and data access.
**Package/app(s):** `@vitruvius/core`, `@vitruvius/db`, `apps/web`.
**Depends on:** 01-core, 02-db, 03-web-upload, 08-web-editor.

## Inputs

- Supabase Authentication credentials (email/password).
- SvelteKit request session cookies (`sb-access-token`, `sb-refresh-token`).
- Database Context: `auth.uid()` from Supabase JWT.
- Env: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## Outputs

- Secure user sessions and JWTs stored in SvelteKit cookies.
- Row-level isolation on `manuals`, `steps`, `jobs`, and `learnings` tables.
- Redirects to `/login` for unauthenticated routes.

## In scope

- **Authentication Flow:** Sign up, log in, log out, and password reset flows using Supabase Auth.
- **Protected Routes:** `/manuals` and `/manuals/[id]` routes require authenticated session; otherwise redirect to `/login`.
- **Database Tenant Isolation:**
  - Add `user_id` (uuid referencing `auth.users`) to `manuals` table.
  - Enable Row Level Security (RLS) policies on `manuals`, `steps`, and `jobs` checking if `user_id = auth.uid()`.
  - Let the engine (`service_role` bypass) read/write all rows to process and export.
  - SvelteKit Session Sync: SvelteKit server hook (`hooks.server.ts`) to validate JWT cookies and set local session context (`event.locals.session`).

## Out of scope

- Multi-user organizations (teams, roles, and permissions).
- Third-party OAuth providers (Google, GitHub, etc.).
- Billing, subscriptions, or seat limits.

## Acceptance criteria

- An unauthenticated visitor is redirected to `/login` when requesting protected routes.
- An authenticated user can only view, create, edit, or export their own manuals.
- Requesting `/manuals/[other-user-manual-id]` returns a 404 or 403 error.
- The background engine worker (running as `service_role`) continues to claim, process, and update jobs across all users without hindrance.

## Validation

- `pnpm --filter @vitruvius/core typecheck`
- `pnpm --filter @vitruvius/db lint`
- `pnpm --filter @vitruvius/web check`
- Manual Verification:
  - Register two users (User A, User B).
  - Create a manual as User A.
  - Verify User B cannot access User A's manual via direct URL or list views.
