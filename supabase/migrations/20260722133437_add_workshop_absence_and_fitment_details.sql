alter table public.workshop_jobs
  add column if not exists tyre_quantity integer not null default 0,
  add column if not exists wheel_fitment boolean not null default false;

alter table public.workshop_jobs
  drop constraint if exists workshop_jobs_tyre_quantity_check;

alter table public.workshop_jobs
  add constraint workshop_jobs_tyre_quantity_check
  check (tyre_quantity between 0 and 12);

alter table public.workshop_technician_breaks
  drop constraint if exists workshop_technician_breaks_type_check;

alter table public.workshop_technician_breaks
  add constraint workshop_technician_breaks_type_check
  check (break_type in ('TEA_1', 'TEA_2', 'LUNCH', 'TYRE_COLLECTION', 'MISC_TASK', 'ABSENT'));
