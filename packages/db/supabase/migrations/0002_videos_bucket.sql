-- Spec 03-web-upload — the storage bucket that holds uploaded source videos.
--
-- Private bucket: objects are reachable only with the service-role key (the web
-- server action) or a signed URL. The engine (spec 07) reads from here via the
-- service-role key. Public read policies for the web client land with the
-- web/auth spec, alongside the manuals/steps RLS policies.
-- Corrective on conflict: if a `videos` bucket already exists (e.g. created
-- manually as public), force it private so source videos are never world-readable.
INSERT INTO
	storage.buckets (id, name, public)
VALUES
	('videos', 'videos', FALSE)
ON CONFLICT (id) DO UPDATE
SET
	public = FALSE;
