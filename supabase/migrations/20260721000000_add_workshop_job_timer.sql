alter table public.workshop_jobs
  add column if not exists started_at timestamptz;

comment on column public.workshop_jobs.started_at is
  'The check-in time for a workshop job. Set by the secured workshop API on the first active workflow move.';

update public.workshop_jobs
set started_at = updated_at
where started_at is null
  and status in ('CHECK_IN', 'IN_PROGRESS', 'QUALITY_CHECK', 'READY', 'COLLECTED');
