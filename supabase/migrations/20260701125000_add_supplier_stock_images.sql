create table if not exists public.supplier_stock_images (
  id uuid primary key default gen_random_uuid(),
  supplier text not null,
  source text not null default 'local-import',
  source_file_id text not null,
  file_name text not null,
  storage_bucket text not null default 'supplier-stock-images',
  storage_path text not null,
  public_image_url text not null,
  mime_type text not null,
  design_key text not null,
  finish_key text,
  rim_size text,
  pcd text,
  tags text[] not null default array[]::text[],
  active boolean not null default true,
  imported_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  constraint supplier_stock_images_supplier_file_uidx unique (supplier, source_file_id),
  constraint supplier_stock_images_file_name_not_empty check (btrim(file_name) <> ''),
  constraint supplier_stock_images_design_key_not_empty check (btrim(design_key) <> ''),
  constraint supplier_stock_images_image_mime_check check (mime_type like 'image/%')
);

create index if not exists supplier_stock_images_supplier_active_idx
  on public.supplier_stock_images (supplier, active);

create index if not exists supplier_stock_images_design_idx
  on public.supplier_stock_images (supplier, design_key, finish_key)
  where active = true;

create index if not exists supplier_stock_images_tags_idx
  on public.supplier_stock_images using gin (tags);

create or replace function public.set_supplier_stock_images_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_supplier_stock_images_updated_at() from public;

drop trigger if exists set_supplier_stock_images_updated_at on public.supplier_stock_images;
create trigger set_supplier_stock_images_updated_at
before update on public.supplier_stock_images
for each row
execute function public.set_supplier_stock_images_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'supplier-stock-images',
  'supplier-stock-images',
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

alter table public.supplier_stock_images enable row level security;

grant select on table public.supplier_stock_images to anon, authenticated;
grant select, insert, update, delete on table public.supplier_stock_images to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'supplier_stock_images'
      and policyname = 'anon can read active supplier stock images'
  ) then
    create policy "anon can read active supplier stock images"
    on public.supplier_stock_images
    for select
    to anon
    using (active = true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'supplier_stock_images'
      and policyname = 'authenticated can read active supplier stock images'
  ) then
    create policy "authenticated can read active supplier stock images"
    on public.supplier_stock_images
    for select
    to authenticated
    using (active = true);
  end if;
end $$;
