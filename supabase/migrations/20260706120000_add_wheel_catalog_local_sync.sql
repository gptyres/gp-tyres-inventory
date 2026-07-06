alter table public.wheel_catalog_items
  add column if not exists local_relative_path text,
  add column if not exists source_size_bytes bigint,
  add column if not exists content_sha256 text;

create index if not exists wheel_catalog_items_local_relative_path_idx
  on public.wheel_catalog_items (local_relative_path)
  where active = true;

create index if not exists wheel_catalog_items_content_sha256_idx
  on public.wheel_catalog_items (content_sha256)
  where active = true;

create table if not exists public.wheel_catalog_sync_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'started',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  source_label text not null default 'WHEEL CATALOG 2026 Q3_LIVE',
  files_scanned integer not null default 0,
  files_uploaded integer not null default 0,
  files_skipped integer not null default 0,
  files_failed integer not null default 0,
  rows_deactivated integer not null default 0,
  error_message text,
  constraint wheel_catalog_sync_runs_status_check
    check (status in ('started', 'completed', 'failed'))
);

create index if not exists wheel_catalog_sync_runs_started_at_idx
  on public.wheel_catalog_sync_runs (started_at desc);

alter table public.wheel_catalog_sync_runs enable row level security;

revoke all on table public.wheel_catalog_sync_runs from public;
grant select on table public.wheel_catalog_sync_runs to anon, authenticated;
grant select, insert, update, delete on table public.wheel_catalog_sync_runs to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'wheel_catalog_sync_runs'
      and policyname = 'anon can read wheel catalog sync runs'
  ) then
    create policy "anon can read wheel catalog sync runs"
    on public.wheel_catalog_sync_runs
    for select
    to anon
    using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'wheel_catalog_sync_runs'
      and policyname = 'authenticated can read wheel catalog sync runs'
  ) then
    create policy "authenticated can read wheel catalog sync runs"
    on public.wheel_catalog_sync_runs
    for select
    to authenticated
    using (true);
  end if;
end $$;
