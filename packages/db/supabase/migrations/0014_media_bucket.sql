-- Spec 07-engine — the storage bucket that holds per-step keyframes and illustrations.
--
-- Private bucket: the engine writes the images with the service-role key (publishStepMedia);
-- the web app and the export job hand out short-lived signed URLs at read time, exactly like
-- `videos`/`exports`. Never world-readable. Keyframe/illustration object keys are scoped under
-- the manual id (`<manualId>/keyframes/...`, `<manualId>/illustrations/...`) so a single RLS
-- predicate can authorize reads by the owning manual.
-- Corrective on conflict: force an existing `media` bucket private.
INSERT INTO
	storage.buckets (id, name, public)
VALUES
	('media', 'media', FALSE)
ON CONFLICT (id) DO UPDATE
SET
	public = FALSE;

-- Media is written by the engine (service_role), so `owner` may not match the end user.
-- Allow authenticated users to read only media that corresponds to manuals they own. The key
-- is `<manualId>/<kind>/<file>`, so the manual id is the first path segment.
CREATE POLICY storage_media_auth_policy ON storage.objects FOR
SELECT
	TO authenticated USING (
		bucket_id = 'media'
		AND EXISTS (
			SELECT
				1
			FROM
				public.manuals
			WHERE
				public.manuals.id::text = split_part(name, '/', 1)
				AND public.manuals.user_id = auth.uid ()
		)
	);
