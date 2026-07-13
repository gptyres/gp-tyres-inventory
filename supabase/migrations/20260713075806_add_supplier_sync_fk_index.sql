create index if not exists supplier_catalog_sources_job_idx
  on public.supplier_catalog_sources (activated_by_job_id)
  where activated_by_job_id is not null;
