alter table public.workshop_technician_breaks
  drop constraint if exists workshop_technician_breaks_type_check;

alter table public.workshop_technician_breaks
  add constraint workshop_technician_breaks_type_check
  check (break_type in ('TEA_1', 'TEA_2', 'LUNCH', 'TYRE_COLLECTION', 'MISC_TASK'));
