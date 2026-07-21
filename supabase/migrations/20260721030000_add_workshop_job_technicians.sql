-- Preserve the original technician field for compatibility while supporting
-- multiple technicians on every workshop job.
alter table public.workshop_jobs
  add column if not exists technicians text[] not null default '{}';

update public.workshop_jobs
set technicians = case
  when technician is null or btrim(technician) = '' then '{}'
  else array[technician]
end
where cardinality(technicians) = 0;

create index if not exists workshop_jobs_technicians_idx
  on public.workshop_jobs using gin (technicians);
