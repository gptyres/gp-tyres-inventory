-- Add tyre collection as an availability state, and keep historic records under
-- Abu Bakr after the roster correction.
alter table public.workshop_technician_breaks
  drop constraint if exists workshop_technician_breaks_type_check;

alter table public.workshop_technician_breaks
  add constraint workshop_technician_breaks_type_check
  check (break_type in ('TEA_1', 'TEA_2', 'LUNCH', 'TYRE_COLLECTION'));

update public.workshop_jobs
set technician = 'Abu Bakr'
where technician = 'Abdul Razak';

update public.workshop_jobs
set technicians = array_replace(technicians, 'Abdul Razak', 'Abu Bakr')
where technicians @> array['Abdul Razak'];

update public.workshop_technician_breaks
set technician = 'Abu Bakr'
where technician = 'Abdul Razak';
