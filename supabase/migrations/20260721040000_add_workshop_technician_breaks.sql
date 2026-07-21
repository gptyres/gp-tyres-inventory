create table if not exists public.workshop_technician_breaks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  technician text not null,
  break_type text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint workshop_technician_breaks_type_check check (break_type in ('TEA_1', 'TEA_2', 'LUNCH')),
  constraint workshop_technician_breaks_end_after_start_check check (ended_at is null or ended_at >= started_at)
);

create unique index if not exists workshop_technician_breaks_one_active_idx
  on public.workshop_technician_breaks (organization_id, technician)
  where ended_at is null;

create index if not exists workshop_technician_breaks_org_started_idx
  on public.workshop_technician_breaks (organization_id, started_at desc);

alter table public.workshop_technician_breaks enable row level security;
revoke all on table public.workshop_technician_breaks from anon, authenticated;
grant select, insert, update on table public.workshop_technician_breaks to service_role;

drop policy if exists "service role manages workshop technician breaks" on public.workshop_technician_breaks;
create policy "service role manages workshop technician breaks"
on public.workshop_technician_breaks
for all
to service_role
using (organization_id = '8bbf5ea0-b71f-4c2a-a2c0-55ce7316e8c6'::uuid)
with check (organization_id = '8bbf5ea0-b71f-4c2a-a2c0-55ce7316e8c6'::uuid);
