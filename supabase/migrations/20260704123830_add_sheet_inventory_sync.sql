create table if not exists public.sheet_inventory_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'google-sheet',
  spreadsheet_id text not null,
  sheet_name text not null,
  sync_mode text not null default 'batch',
  dry_run boolean not null default false,
  status text not null default 'started',
  rows_received integer not null default 0,
  rows_parsed integer not null default 0,
  rows_upserted integer not null default 0,
  rows_skipped integer not null default 0,
  rows_failed integer not null default 0,
  row_results jsonb not null default '[]'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sheet_inventory_sync_runs_started_at_idx
  on public.sheet_inventory_sync_runs (started_at desc);

alter table public.sheet_inventory_sync_runs enable row level security;

drop policy if exists "sheet_inventory_sync_runs_read" on public.sheet_inventory_sync_runs;
create policy "sheet_inventory_sync_runs_read"
  on public.sheet_inventory_sync_runs
  for select
  to anon, authenticated
  using (true);

revoke all on table public.sheet_inventory_sync_runs from public;
grant select on table public.sheet_inventory_sync_runs to anon, authenticated;
grant select, insert, update, delete on table public.sheet_inventory_sync_runs to service_role;
