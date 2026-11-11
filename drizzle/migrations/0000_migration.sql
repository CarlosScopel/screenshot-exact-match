
create type public.app_role as enum ('admin','mentorado','suporte','moderador');
create type public.content_status as enum ('draft','published');

-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  avatar_url text,
  status text not null default 'active' check (status in ('active','suspended')),
  access_expires_at timestamptz,
  admin_notes text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id, 'admin')
$$;

create or replace function public.is_active_member(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = _user_id and p.status = 'active'
    and (p.access_expires_at is null or p.access_expires_at > now()))
$$;

create policy "own roles readable" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

create policy "profiles self or admin read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()));
create policy "profiles admin write" on public.profiles for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "profiles self update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- prevent self-escalation of admin fields
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin(auth.uid()) then
    new.status := old.status;
    new.access_expires_at := old.access_expires_at;
    new.admin_notes := old.admin_notes;
    new.email := old.email;
  end if;
  return new;
end $$;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_fields();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), coalesce(new.email,''))
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'mentorado') on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_last_seen()
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;

-- COHORTS
create table public.cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);
create table public.cohort_members (
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (cohort_id, user_id)
);
create index on public.cohort_members(user_id);
grant select, insert, update, delete on public.cohorts, public.cohort_members to authenticated;
grant all on public.cohorts, public.cohort_members to service_role;
alter table public.cohorts enable row level security;
alter table public.cohort_members enable row level security;
create policy "cohorts admin all" on public.cohorts for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "cohorts member read" on public.cohorts for select to authenticated
  using (exists (select 1 from public.cohort_members m where m.cohort_id = id and m.user_id = auth.uid()));
create policy "members admin all" on public.cohort_members for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "members self read" on public.cohort_members for select to authenticated
  using (user_id = auth.uid());

-- audience helper: null/empty array = all active members
create or replace function public.in_audience(_user_id uuid, _cohorts uuid[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin(_user_id) or (
    public.is_active_member(_user_id) and (
      _cohorts is null or cardinality(_cohorts) = 0 or exists (
        select 1 from public.cohort_members m where m.user_id = _user_id and m.cohort_id = any(_cohorts))))
$$;

-- TRAININGS
create table public.trainings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  cover_url text,
  status content_status not null default 'draft',
  position int not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.training_cohorts (
  training_id uuid not null references public.trainings(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  primary key (training_id, cohort_id)
);
create table public.training_grants (
  training_id uuid not null references public.trainings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (training_id, user_id)
);
create index on public.training_grants(user_id);

create or replace function public.can_access_training(_user_id uuid, _training_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin(_user_id) or (
    public.is_active_member(_user_id)
    and exists (select 1 from public.trainings t where t.id = _training_id and t.status = 'published')
    and (
      exists (select 1 from public.training_grants g where g.training_id = _training_id and g.user_id = _user_id)
      or exists (select 1 from public.training_cohorts tc join public.cohort_members m on m.cohort_id = tc.cohort_id
                 where tc.training_id = _training_id and m.user_id = _user_id)))
$$;

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references public.trainings(id) on delete cascade,
  title text not null,
  description text,
  status content_status not null default 'published',
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.modules(training_id);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules(id) on delete cascade,
  title text not null,
  description text,
  content text,
  video_url text,
  thumbnail_url text,
  duration_minutes int,
  status content_status not null default 'draft',
  available_at timestamptz,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.lessons(module_id);

create or replace function public.can_access_lesson(_user_id uuid, _lesson_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin(_user_id) or exists (
    select 1 from public.lessons l join public.modules m on m.id = l.module_id
    where l.id = _lesson_id and l.status = 'published' and m.status = 'published'
      and (l.available_at is null or l.available_at <= now())
      and public.can_access_training(_user_id, m.training_id))
$$;

create table public.lesson_materials (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  title text not null,
  file_path text,
  url text,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.lesson_materials(lesson_id);

create table public.lesson_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  completed boolean not null default false,
  completed_at timestamptz,
  position_seconds int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create index on public.lesson_progress(lesson_id);
create index on public.lesson_progress(updated_at desc);

create table public.lesson_notes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  content text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

grant select, insert, update, delete on public.trainings, public.training_cohorts, public.training_grants,
  public.modules, public.lessons, public.lesson_materials, public.lesson_progress, public.lesson_notes to authenticated;
grant all on public.trainings, public.training_cohorts, public.training_grants,
  public.modules, public.lessons, public.lesson_materials, public.lesson_progress, public.lesson_notes to service_role;
alter table public.trainings enable row level security;
alter table public.training_cohorts enable row level security;
alter table public.training_grants enable row level security;
alter table public.modules enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_materials enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.lesson_notes enable row level security;

create policy "trainings admin" on public.trainings for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "trainings read" on public.trainings for select to authenticated using (public.can_access_training(auth.uid(), id));
create policy "tc admin" on public.training_cohorts for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "tg admin" on public.training_grants for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "tg self" on public.training_grants for select to authenticated using (user_id = auth.uid());
create policy "modules admin" on public.modules for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "modules read" on public.modules for select to authenticated using (status = 'published' and public.can_access_training(auth.uid(), training_id));
create policy "lessons admin" on public.lessons for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "lessons read" on public.lessons for select to authenticated using (public.can_access_lesson(auth.uid(), id));
create policy "materials admin" on public.lesson_materials for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "materials read" on public.lesson_materials for select to authenticated using (public.can_access_lesson(auth.uid(), lesson_id));
create policy "progress own" on public.lesson_progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_access_lesson(auth.uid(), lesson_id));
create policy "progress admin read" on public.lesson_progress for select to authenticated using (public.is_admin(auth.uid()));
create policy "notes own" on public.lesson_notes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_access_lesson(auth.uid(), lesson_id));

-- LIBRARY
create table public.library_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create table public.library_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category_id uuid references public.library_categories(id) on delete set null,
  kind text not null default 'file' check (kind in ('file','link','article')),
  cover_url text,
  tags text[] not null default '{}',
  file_path text,
  file_name text,
  url text,
  body text,
  cohort_ids uuid[] not null default '{}',
  status content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.library_categories, public.library_items to authenticated;
grant all on public.library_categories, public.library_items to service_role;
alter table public.library_categories enable row level security;
alter table public.library_items enable row level security;
create policy "libcat admin" on public.library_categories for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "libcat read" on public.library_categories for select to authenticated using (public.is_active_member(auth.uid()));
create policy "lib admin" on public.library_items for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "lib read" on public.library_items for select to authenticated using (status = 'published' and public.in_audience(auth.uid(), cohort_ids));

-- TOOLS
create table public.tools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  icon text not null default 'Sparkles',
  category text,
  status text not null default 'soon' check (status in ('active','beta','soon')),
  kind text not null default 'internal' check (kind in ('internal','external')),
  route text,
  url text,
  cohort_ids uuid[] not null default '{}',
  enabled boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.tools to authenticated;
grant all on public.tools to service_role;
alter table public.tools enable row level security;
create policy "tools admin" on public.tools for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "tools read" on public.tools for select to authenticated using (enabled and public.in_audience(auth.uid(), cohort_ids));

-- ANNOUNCEMENTS
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  pinned boolean not null default false,
  cohort_ids uuid[] not null default '{}',
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.announcements to authenticated;
grant all on public.announcements to service_role;
alter table public.announcements enable row level security;
create policy "ann admin" on public.announcements for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "ann read" on public.announcements for select to authenticated using (published_at <= now() and public.in_audience(auth.uid(), cohort_ids));

-- SETTINGS (single row, readable publicly for login screen branding)
create table public.platform_settings (
  id int primary key default 1 check (id = 1),
  platform_name text not null default 'Portal da Mentoria',
  logo_url text,
  favicon_url text,
  primary_color text not null default '#3B82F6',
  welcome_message text not null default 'Seu ambiente de conhecimento, estratégias e ferramentas exclusivas.',
  support_email text,
  support_whatsapp text,
  social_links jsonb not null default '{}'::jsonb,
  login_title text not null default 'Bem-vindo de volta',
  login_subtitle text not null default 'Acesse seu ambiente exclusivo de mentoria.',
  login_image_url text,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (1);
grant select on public.platform_settings to anon, authenticated;
grant update on public.platform_settings to authenticated;
grant all on public.platform_settings to service_role;
alter table public.platform_settings enable row level security;
create policy "settings public read" on public.platform_settings for select to anon, authenticated using (true);
create policy "settings admin update" on public.platform_settings for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- STORAGE policies (buckets created separately)
create or replace function public.can_read_material(_user_id uuid, _path text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare parts text[] := string_to_array(_path, '/'); rid uuid;
begin
  if public.is_admin(_user_id) then return true; end if;
  begin rid := parts[2]::uuid; exception when others then return false; end;
  if parts[1] = 'lesson' then return public.can_access_lesson(_user_id, rid); end if;
  if parts[1] = 'library' then
    return exists (select 1 from public.library_items i where i.id = rid and i.status = 'published' and public.in_audience(_user_id, i.cohort_ids));
  end if;
  return false;
end $$;

create policy "materials read" on storage.objects for select to authenticated
  using (bucket_id = 'materials' and public.can_read_material(auth.uid(), name));
create policy "materials admin write" on storage.objects for insert to authenticated
  with check (bucket_id = 'materials' and public.is_admin(auth.uid()));
create policy "materials admin update" on storage.objects for update to authenticated
  using (bucket_id = 'materials' and public.is_admin(auth.uid()));
create policy "materials admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'materials' and public.is_admin(auth.uid()));
create policy "media admin write" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (public.is_admin(auth.uid()) or (name like 'avatars/' || auth.uid()::text || '/%')));
create policy "media admin update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (public.is_admin(auth.uid()) or (name like 'avatars/' || auth.uid()::text || '/%')));
create policy "media admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_admin(auth.uid()));
