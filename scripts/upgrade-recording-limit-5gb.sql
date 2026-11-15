-- Increase only the private weekly-call limit; keep policies, ownership and files intact.
-- The Lovable project-wide Upload size limit must also be set to 5 GB in More > Storage.
-- This SQL cannot change that hosting-level setting.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.mentorship_recordings
 DROP CONSTRAINT mentorship_recordings_size_bytes_check,
 ADD CONSTRAINT mentorship_recordings_size_bytes_check
 CHECK (size_bytes BETWEEN 1 AND 5368709120);
DO $$
BEGIN
 UPDATE storage.buckets SET file_size_limit = 5368709120
 WHERE id = 'mentorship-recordings' AND public = false;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Private mentorship-recordings bucket not found; changes rolled back.';
 END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
