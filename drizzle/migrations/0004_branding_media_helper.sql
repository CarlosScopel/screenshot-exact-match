CREATE OR REPLACE FUNCTION public.is_branding_media(p_name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.platform_settings s WHERE s.id=1 AND ('media:'||p_name) IN (coalesce(s.logo_url,''),coalesce(s.favicon_url,''),coalesce(s.login_image_url,'')))
$$;
GRANT EXECUTE ON FUNCTION public.is_branding_media(text) TO anon, authenticated;
DROP POLICY IF EXISTS "media branding public read" ON storage.objects;
CREATE POLICY "media branding public read" ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'media' AND name LIKE 'branding/%' AND public.is_branding_media(name));