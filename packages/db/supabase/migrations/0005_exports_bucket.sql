-- Spec 09-export — the storage bucket that holds exported manual PDFs.
--
-- Private bucket: the engine writes the PDF with the service-role key (spec 09); the
-- web server hands users a short-lived signed URL to download. Never world-readable.
-- Corrective on conflict: force an existing `exports` bucket private.
INSERT INTO
	storage.buckets (id, name, public)
VALUES
	('exports', 'exports', FALSE)
ON CONFLICT (id) DO UPDATE
SET
	public = FALSE;
