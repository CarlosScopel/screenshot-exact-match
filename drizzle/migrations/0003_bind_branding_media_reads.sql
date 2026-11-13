DROP POLICY IF EXISTS "media branding public read" ON storage.objects;
CREATE POLICY "media branding public read" ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'media' AND name LIKE 'branding/%' AND EXISTS (
  SELECT 1 FROM public.platform_settings s WHERE s.id = 1 AND
  ('media:' || storage.objects.name) IN (coalesce(s.logo_url,''), coalesce(s.favicon_url,''), coalesce(s.login_image_url,''))));