alter table public.supplier_sync_jobs
  add column if not exists target_supplier text,
  add column if not exists target_catalog text,
  add column if not exists progress_stage text not null default 'queued',
  add column if not exists progress_current integer not null default 0,
  add column if not exists progress_total integer,
  add column if not exists progress_message text;

alter table public.supplier_sync_jobs
  drop constraint if exists supplier_sync_jobs_scope_check;

alter table public.supplier_sync_jobs
  add constraint supplier_sync_jobs_scope_check
    check (scope in ('ALL_ENABLED', 'SINGLE_SUPPLIER')),
  add constraint supplier_sync_jobs_target_check
    check (
      (scope = 'ALL_ENABLED' and target_supplier is null and target_catalog is null)
      or (
        scope = 'SINGLE_SUPPLIER'
        and nullif(btrim(target_supplier), '') is not null
        and nullif(btrim(target_catalog), '') is not null
      )
    ),
  add constraint supplier_sync_jobs_progress_stage_check
    check (progress_stage in (
      'queued',
      'fetching',
      'validating',
      'publishing',
      'completed',
      'failed',
      'cancelled'
    )),
  add constraint supplier_sync_jobs_progress_counts_check
    check (
      progress_current >= 0
      and (progress_total is null or progress_total >= 0)
      and (progress_total is null or progress_current <= progress_total)
    );

create index if not exists supplier_sync_jobs_target_catalog_requested_idx
  on public.supplier_sync_jobs (target_catalog, requested_at desc)
  where target_catalog is not null;

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
    heartbeat_at = now(),
    progress_stage = 'fetching',
    progress_current = 0,
    progress_total = null,
    progress_message = case
      when scope = 'SINGLE_SUPPLIER' then 'Connecting to ' || target_supplier || '…'
      else 'Connecting to enabled supplier portals…'
    end
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

create or replace function public.recover_stale_supplier_sync_jobs(
  p_stale_after_seconds integer default 180
)
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
    progress_stage = 'failed',
    progress_message = 'Worker heartbeat expired.',
    completed_at = now(),
    safe_error = 'Worker heartbeat expired before the sync completed.'
  where status = 'running'
    and coalesce(heartbeat_at, started_at, requested_at)
      < now() - make_interval(secs => p_stale_after_seconds);

  get diagnostics recovered_count = row_count;
  return recovered_count;
end;
$$;

revoke execute on function public.recover_stale_supplier_sync_jobs(integer)
  from public, anon, authenticated;
grant execute on function public.recover_stale_supplier_sync_jobs(integer)
  to service_role;
