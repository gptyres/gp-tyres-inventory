alter table public.supplier_sync_jobs
  drop constraint if exists supplier_sync_jobs_scope_check;

alter table public.supplier_sync_jobs
  add constraint supplier_sync_jobs_scope_check
  check (scope in ('ALL_ENABLED', 'SINGLE_SUPPLIER', 'MANUAL_UPLOAD'));
