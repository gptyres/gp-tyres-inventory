alter table public.supplier_sync_jobs
  drop constraint if exists supplier_sync_jobs_target_check;

alter table public.supplier_sync_jobs
  add constraint supplier_sync_jobs_target_check
  check (
    (scope = 'ALL_ENABLED' and target_supplier is null and target_catalog is null)
    or (
      scope in ('SINGLE_SUPPLIER', 'MANUAL_UPLOAD')
      and nullif(btrim(target_supplier), '') is not null
      and nullif(btrim(target_catalog), '') is not null
    )
  );
