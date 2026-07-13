create table if not exists public.supplier_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'ALL_ENABLED',
  status text not null default 'queued',
  requested_by_staff text not null,
  requested_by_terminal text not null,
  requested_ip_hash text,
  worker_id text,
  runner_run_id text,
  run_directory text,
  artifact_name text,
  suppliers_total integer not null default 0,
  suppliers_completed integer not null default 0,
  suppliers_failed integer not null default 0,
  suppliers_skipped integer not null default 0,
  rows_published integer not null default 0,
  result_summary jsonb not null default '{}'::jsonb,
  safe_error text,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  heartbeat_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint supplier_sync_jobs_scope_check
    check (scope = 'ALL_ENABLED'),
  constraint supplier_sync_jobs_status_check
    check (status in ('queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled')),
  constraint supplier_sync_jobs_nonnegative_counts_check
    check (
      suppliers_total >= 0
      and suppliers_completed >= 0
      and suppliers_failed >= 0
      and suppliers_skipped >= 0
      and rows_published >= 0
    )
);

create unique index if not exists supplier_sync_jobs_one_active_idx
  on public.supplier_sync_jobs ((1))
  where status in ('queued', 'running');

create index if not exists supplier_sync_jobs_status_requested_idx
  on public.supplier_sync_jobs (status, requested_at desc);

create index if not exists supplier_sync_jobs_requested_at_idx
  on public.supplier_sync_jobs (requested_at desc);

create table if not exists public.supplier_sync_workers (
  worker_id text primary key,
  status text not null default 'idle',
  current_job_id uuid references public.supplier_sync_jobs(id) on delete set null,
  last_heartbeat_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint supplier_sync_workers_status_check
    check (status in ('idle', 'busy', 'stopping'))
);

create index if not exists supplier_sync_workers_heartbeat_idx
  on public.supplier_sync_workers (last_heartbeat_at desc);

create index if not exists supplier_sync_workers_current_job_idx
  on public.supplier_sync_workers (current_job_id)
  where current_job_id is not null;

create table if not exists public.supplier_catalog_snapshots (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.supplier_sync_jobs(id) on delete restrict,
  catalog_key text not null,
  registry_supplier text not null,
  status text not null default 'staging',
  row_count integer not null default 0,
  source_files text[] not null default '{}'::text[],
  safe_error text,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  constraint supplier_catalog_snapshots_status_check
    check (status in ('staging', 'active', 'failed', 'retired')),
  constraint supplier_catalog_snapshots_row_count_check
    check (row_count >= 0)
);

create index if not exists supplier_catalog_snapshots_catalog_created_idx
  on public.supplier_catalog_snapshots (catalog_key, created_at desc);

create index if not exists supplier_catalog_snapshots_job_idx
  on public.supplier_catalog_snapshots (job_id);

create table if not exists public.supplier_catalog_items (
  id bigint generated always as identity primary key,
  snapshot_id uuid not null references public.supplier_catalog_snapshots(id) on delete cascade,
  catalog_key text not null,
  source_key text not null,
  product_type text not null default 'TYRE',
  supplier text not null,
  supplier_sku text,
  brand text not null default 'Unknown',
  product_name text not null,
  category text,
  size text,
  stock_location text,
  stock_units_availability text,
  stock_units integer not null default 0,
  selling_price numeric(12, 2) not null default 0,
  product_url text,
  source_stock_detail text,
  source_file text not null,
  imported_at timestamptz not null default now(),
  constraint supplier_catalog_items_product_type_check
    check (product_type in ('TYRE', 'WHEEL')),
  constraint supplier_catalog_items_stock_units_check
    check (stock_units >= 0),
  constraint supplier_catalog_items_selling_price_check
    check (selling_price >= 0),
  constraint supplier_catalog_items_snapshot_source_key_unique
    unique (snapshot_id, source_key)
);

create index if not exists supplier_catalog_items_snapshot_id_idx
  on public.supplier_catalog_items (snapshot_id, id);

create index if not exists supplier_catalog_items_catalog_snapshot_idx
  on public.supplier_catalog_items (catalog_key, snapshot_id);

create index if not exists supplier_catalog_items_search_idx
  on public.supplier_catalog_items
  using gin (
    to_tsvector(
      'simple',
      coalesce(brand, '') || ' ' || coalesce(product_name, '') || ' ' || coalesce(size, '')
    )
  );

create table if not exists public.supplier_catalog_sources (
  catalog_key text primary key,
  registry_supplier text not null,
  active_snapshot_id uuid references public.supplier_catalog_snapshots(id) on delete restrict,
  activated_by_job_id uuid references public.supplier_sync_jobs(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create index if not exists supplier_catalog_sources_active_snapshot_idx
  on public.supplier_catalog_sources (active_snapshot_id)
  where active_snapshot_id is not null;

alter table public.supplier_sync_jobs enable row level security;
alter table public.supplier_sync_workers enable row level security;
alter table public.supplier_catalog_snapshots enable row level security;
alter table public.supplier_catalog_items enable row level security;
alter table public.supplier_catalog_sources enable row level security;

revoke all on table public.supplier_sync_jobs from public, anon, authenticated;
revoke all on table public.supplier_sync_workers from public, anon, authenticated;
revoke all on table public.supplier_catalog_snapshots from public, anon, authenticated;
revoke all on table public.supplier_catalog_items from public, anon, authenticated;
revoke all on table public.supplier_catalog_sources from public, anon, authenticated;

grant select, insert, update, delete on table public.supplier_sync_jobs to service_role;
grant select, insert, update, delete on table public.supplier_sync_workers to service_role;
grant select, insert, update, delete on table public.supplier_catalog_snapshots to service_role;
grant select, insert, update, delete on table public.supplier_catalog_items to service_role;
grant select, insert, update, delete on table public.supplier_catalog_sources to service_role;
grant usage, select on sequence public.supplier_catalog_items_id_seq to service_role;

grant select on table public.supplier_catalog_snapshots to anon, authenticated;
grant select on table public.supplier_catalog_items to anon, authenticated;
grant select on table public.supplier_catalog_sources to anon, authenticated;

drop policy if exists supplier_catalog_sources_read on public.supplier_catalog_sources;
create policy supplier_catalog_sources_read
  on public.supplier_catalog_sources
  for select
  to anon, authenticated
  using (active_snapshot_id is not null);

drop policy if exists supplier_catalog_snapshots_active_read on public.supplier_catalog_snapshots;
create policy supplier_catalog_snapshots_active_read
  on public.supplier_catalog_snapshots
  for select
  to anon, authenticated
  using (
    status = 'active'
    and
    exists (
      select 1
      from public.supplier_catalog_sources source
      where source.active_snapshot_id = supplier_catalog_snapshots.id
    )
  );

drop policy if exists supplier_catalog_items_active_read on public.supplier_catalog_items;
create policy supplier_catalog_items_active_read
  on public.supplier_catalog_items
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.supplier_catalog_sources source
      join public.supplier_catalog_snapshots snapshot
        on snapshot.id = source.active_snapshot_id
      where source.active_snapshot_id = supplier_catalog_items.snapshot_id
        and snapshot.status = 'active'
    )
  );

create or replace function public.claim_supplier_sync_job(p_worker_id text)
returns setof public.supplier_sync_jobs
language sql
security definer
set search_path = ''
as $$
  update public.supplier_sync_jobs
  set
    status = 'running',
    worker_id = p_worker_id,
    started_at = coalesce(started_at, now()),
    heartbeat_at = now()
  where id = (
    select job.id
    from public.supplier_sync_jobs job
    where job.status = 'queued'
    order by job.requested_at
    limit 1
    for update skip locked
  )
  returning *;
$$;

revoke execute on function public.claim_supplier_sync_job(text) from public, anon, authenticated;
grant execute on function public.claim_supplier_sync_job(text) to service_role;

create or replace function public.recover_stale_supplier_sync_jobs(p_stale_after_seconds integer default 180)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  recovered_count integer;
begin
  if p_stale_after_seconds < 60 then
    raise exception 'stale timeout must be at least 60 seconds';
  end if;

  update public.supplier_sync_jobs
  set
    status = 'failed',
    completed_at = now(),
    safe_error = 'Worker heartbeat expired before the batch completed.'
  where status = 'running'
    and coalesce(heartbeat_at, started_at, requested_at)
      < now() - make_interval(secs => p_stale_after_seconds);

  get diagnostics recovered_count = row_count;
  return recovered_count;
end;
$$;

revoke execute on function public.recover_stale_supplier_sync_jobs(integer) from public, anon, authenticated;
grant execute on function public.recover_stale_supplier_sync_jobs(integer) to service_role;

create or replace function public.activate_supplier_catalog_snapshots(
  p_job_id uuid,
  p_snapshots jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot_entry jsonb;
  requested_snapshot_id uuid;
  requested_catalog_key text;
  requested_registry_supplier text;
  previous_snapshot_id uuid;
  activated_count integer := 0;
begin
  if jsonb_typeof(p_snapshots) <> 'array' or jsonb_array_length(p_snapshots) = 0 then
    raise exception 'snapshots must be a non-empty JSON array';
  end if;

  for snapshot_entry in select value from jsonb_array_elements(p_snapshots)
  loop
    requested_snapshot_id := (snapshot_entry ->> 'snapshot_id')::uuid;
    requested_catalog_key := snapshot_entry ->> 'catalog_key';
    requested_registry_supplier := snapshot_entry ->> 'registry_supplier';

    if not exists (
      select 1
      from public.supplier_catalog_snapshots snapshot
      where snapshot.id = requested_snapshot_id
        and snapshot.job_id = p_job_id
        and snapshot.catalog_key = requested_catalog_key
        and snapshot.registry_supplier = requested_registry_supplier
        and snapshot.status = 'staging'
        and snapshot.row_count > 0
    ) then
      raise exception 'snapshot % is not ready for activation', requested_snapshot_id;
    end if;
  end loop;

  for snapshot_entry in select value from jsonb_array_elements(p_snapshots)
  loop
    requested_snapshot_id := (snapshot_entry ->> 'snapshot_id')::uuid;
    requested_catalog_key := snapshot_entry ->> 'catalog_key';
    requested_registry_supplier := snapshot_entry ->> 'registry_supplier';

    select source.active_snapshot_id
    into previous_snapshot_id
    from public.supplier_catalog_sources source
    where source.catalog_key = requested_catalog_key
    for update;

    update public.supplier_catalog_snapshots
    set status = 'active', activated_at = now()
    where id = requested_snapshot_id;

    insert into public.supplier_catalog_sources (
      catalog_key,
      registry_supplier,
      active_snapshot_id,
      activated_by_job_id,
      updated_at
    )
    values (
      requested_catalog_key,
      requested_registry_supplier,
      requested_snapshot_id,
      p_job_id,
      now()
    )
    on conflict (catalog_key) do update
    set
      registry_supplier = excluded.registry_supplier,
      active_snapshot_id = excluded.active_snapshot_id,
      activated_by_job_id = excluded.activated_by_job_id,
      updated_at = excluded.updated_at;

    if previous_snapshot_id is not null and previous_snapshot_id <> requested_snapshot_id then
      update public.supplier_catalog_snapshots
      set status = 'retired'
      where id = previous_snapshot_id;
    end if;

    activated_count := activated_count + 1;
  end loop;

  return activated_count;
end;
$$;

revoke execute on function public.activate_supplier_catalog_snapshots(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.activate_supplier_catalog_snapshots(uuid, jsonb)
  to service_role;
