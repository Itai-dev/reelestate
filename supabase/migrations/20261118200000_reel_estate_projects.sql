-- Saved projects for signed-in users, plus a private storage bucket for their
-- photos, clips, logos and music. Each user only sees their own folder.
create table if not exists public.re_projects (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  data jsonb not null default '{}'::jsonb,
  cover_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists re_projects_user_idx on public.re_projects (user_id, updated_at desc);

alter table public.re_projects enable row level security;

drop policy if exists "re_projects own rows" on public.re_projects;
create policy "re_projects own rows" on public.re_projects
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('re-media', 're-media', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "re-media own folder read" on storage.objects;
create policy "re-media own folder read" on storage.objects
  for select to authenticated
  using (bucket_id = 're-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "re-media own folder insert" on storage.objects;
create policy "re-media own folder insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 're-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "re-media own folder update" on storage.objects;
create policy "re-media own folder update" on storage.objects
  for update to authenticated
  using (bucket_id = 're-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "re-media own folder delete" on storage.objects;
create policy "re-media own folder delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 're-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
