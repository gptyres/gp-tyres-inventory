create table if not exists public.wheel_catalog_items (
  id uuid primary key default gen_random_uuid(),
  source_root_folder_id text not null,
  drive_file_id text not null,
  drive_folder_id text,
  folder_path text not null default '',
  folder_path_parts text[] not null default array[]::text[],
  category text,
  rim_size text,
  pcd text,
  tags text[] not null default array[]::text[],
  file_name text not null,
  drive_url text not null,
  storage_bucket text not null default 'wheel-catalog-images',
  storage_path text not null,
  public_image_url text not null,
  mime_type text not null,
  source_modified_at timestamptz,
  active boolean not null default true,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wheel_catalog_items_drive_file_uidx unique (drive_file_id),
  constraint wheel_catalog_items_file_name_not_empty check (btrim(file_name) <> ''),
  constraint wheel_catalog_items_image_mime_check check (mime_type like 'image/%')
);

create index if not exists wheel_catalog_items_active_idx
  on public.wheel_catalog_items (active);

create index if not exists wheel_catalog_items_size_pcd_idx
  on public.wheel_catalog_items (rim_size, pcd)
  where active = true;

create index if not exists wheel_catalog_items_folder_path_idx
  on public.wheel_catalog_items (folder_path);

create index if not exists wheel_catalog_items_tags_idx
  on public.wheel_catalog_items using gin (tags);

create or replace function public.set_wheel_catalog_items_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_wheel_catalog_items_updated_at() from public;

drop trigger if exists set_wheel_catalog_items_updated_at on public.wheel_catalog_items;
create trigger set_wheel_catalog_items_updated_at
before update on public.wheel_catalog_items
for each row
execute function public.set_wheel_catalog_items_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wheel-catalog-images',
  'wheel-catalog-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();

alter table public.wheel_catalog_items enable row level security;

grant select on table public.wheel_catalog_items to anon, authenticated;
grant select, insert, update, delete on table public.wheel_catalog_items to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'wheel_catalog_items'
      and policyname = 'anon can read active wheel catalog items'
  ) then
    create policy "anon can read active wheel catalog items"
    on public.wheel_catalog_items
    for select
    to anon
    using (active = true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'wheel_catalog_items'
      and policyname = 'authenticated can read active wheel catalog items'
  ) then
    create policy "authenticated can read active wheel catalog items"
    on public.wheel_catalog_items
    for select
    to authenticated
    using (active = true);
  end if;
end $$;
