drop policy if exists "settings public read" on public.platform_settings;
create policy "settings member read" on public.platform_settings for select to authenticated
  using (public.is_active_member(auth.uid()) or public.is_admin(auth.uid()));
revoke select on public.platform_settings from anon;

create or replace function public.get_public_branding()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', id, 'platform_name', platform_name, 'logo_url', logo_url,
    'favicon_url', favicon_url, 'primary_color', primary_color, 'welcome_message', welcome_message,
    'login_title', login_title, 'login_subtitle', login_subtitle, 'login_image_url', login_image_url,
    'social_links', social_links, 'updated_at', updated_at)
  from public.platform_settings where id = 1
$$;
grant execute on function public.get_public_branding() to anon, authenticated;

drop policy if exists "media read all" on storage.objects;
create policy "media branding public read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'media' and name like 'branding/%');
create policy "media member read" on storage.objects for select to authenticated
  using (bucket_id = 'media' and (public.is_active_member(auth.uid()) or public.is_admin(auth.uid())
    or owner_id = (select auth.uid()::text)));

drop policy if exists "media admin write" on storage.objects;
create policy "media admin write" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (public.is_admin(auth.uid())
    or (name like 'avatars/' || (select auth.uid()::text) || '/%' and owner_id = (select auth.uid()::text))));

drop policy if exists "media admin update" on storage.objects;
create policy "media admin update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (public.is_admin(auth.uid())
    or (name like 'avatars/' || (select auth.uid()::text) || '/%' and owner_id = (select auth.uid()::text))))
  with check (bucket_id = 'media' and (public.is_admin(auth.uid())
    or (name like 'avatars/' || (select auth.uid()::text) || '/%' and owner_id = (select auth.uid()::text))));