-- Migration: 0010_auth_multi_tenant.sql
-- Goal: Add user_id to manuals and secure access via Row-Level Security (RLS).
-- 1. Add user_id column to manuals table, referencing auth.users.
-- We default it to auth.uid() so inserts by authenticated clients automatically claim ownership.
ALTER TABLE public.manuals
ADD COLUMN user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE DEFAULT auth.uid ();

-- 2. Grant operations on core tables to authenticated users.
GRANT
SELECT
,
	INSERT,
UPDATE,
DELETE ON public.manuals TO authenticated;

GRANT
SELECT
,
	INSERT,
UPDATE,
DELETE ON public.steps TO authenticated;

GRANT
SELECT
,
	INSERT,
UPDATE,
DELETE ON public.jobs TO authenticated;

GRANT
SELECT
,
	INSERT,
UPDATE,
DELETE ON public.learnings TO authenticated;

-- 3. Grant execute privileges on save_manual RPC to authenticated users.
GRANT
EXECUTE ON FUNCTION public.save_manual (jsonb) TO authenticated;

-- 4. Enable Row Level Security (RLS) policies for authenticated users.
-- manuals: owner can do everything
CREATE POLICY manuals_auth_policy ON public.manuals FOR ALL TO authenticated USING (user_id = auth.uid ())
WITH
	CHECK (user_id = auth.uid ());

-- steps: accessible if the parent manual belongs to the authenticated user
CREATE POLICY steps_auth_policy ON public.steps FOR ALL TO authenticated USING (
	EXISTS (
		SELECT
			1
		FROM
			public.manuals
		WHERE
			public.manuals.id = steps.manual_id
			AND public.manuals.user_id = auth.uid ()
	)
)
WITH
	CHECK (
		EXISTS (
			SELECT
				1
			FROM
				public.manuals
			WHERE
				public.manuals.id = steps.manual_id
				AND public.manuals.user_id = auth.uid ()
		)
	);

-- jobs: accessible if the parent manual belongs to the authenticated user
CREATE POLICY jobs_auth_policy ON public.jobs FOR ALL TO authenticated USING (
	EXISTS (
		SELECT
			1
		FROM
			public.manuals
		WHERE
			public.manuals.id = jobs.manual_id
			AND public.manuals.user_id = auth.uid ()
	)
)
WITH
	CHECK (
		EXISTS (
			SELECT
				1
			FROM
				public.manuals
			WHERE
				public.manuals.id = jobs.manual_id
				AND public.manuals.user_id = auth.uid ()
		)
	);

-- learnings: accessible if the parent manual belongs to the authenticated user
CREATE POLICY learnings_auth_policy ON public.learnings FOR ALL TO authenticated USING (
	EXISTS (
		SELECT
			1
		FROM
			public.manuals
		WHERE
			public.manuals.id = learnings.source_manual_id
			AND public.manuals.user_id = auth.uid ()
	)
)
WITH
	CHECK (
		EXISTS (
			SELECT
				1
			FROM
				public.manuals
			WHERE
				public.manuals.id = learnings.source_manual_id
				AND public.manuals.user_id = auth.uid ()
		)
	);

-- 5. Storage Policies for 'videos' and 'exports' buckets.
-- videos: authenticated users may only access objects they own (tenant isolation).
CREATE POLICY storage_videos_auth_policy ON storage.objects FOR ALL TO authenticated USING (
	bucket_id = 'videos'
	AND owner = auth.uid ()
)
WITH
	CHECK (
		bucket_id = 'videos'
		AND owner = auth.uid ()
	);

-- Exports are written by the engine (service_role), so `owner` may not match the end user.
-- Allow authenticated users to read only exports that correspond to manuals they own.
CREATE POLICY storage_exports_auth_policy ON storage.objects FOR
SELECT
	TO authenticated USING (
		bucket_id = 'exports'
		AND EXISTS (
			SELECT
				1
			FROM
				public.manuals
			WHERE
				public.manuals.id::text = split_part(name, '.', 1)
				AND public.manuals.user_id = auth.uid ()
		)
	);
