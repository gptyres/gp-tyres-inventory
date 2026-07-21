create extension if not exists pgcrypto;

create table if not exists public.workshop_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '8bbf5ea0-b71f-4c2a-a2c0-55ce7316e8c6'::uuid,
  job_number text not null,
  customer_id uuid references public.crm_customers(id) on delete set null,
  customer_name text not null,
  customer_phone text,
  vehicle_details text not null,
  registration text,
  service_type text not null,
  status text not null default 'BOOKED',
  priority text not null default 'NORMAL',
  technician text,
  scheduled_for timestamptz,
  estimated_minutes integer,
  notes text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint workshop_jobs_org_job_number_key unique (organization_id, job_number),
  constraint workshop_jobs_status_check check (status in ('BOOKED', 'CHECK_IN', 'IN_PROGRESS', 'QUALITY_CHECK', 'READY', 'COLLECTED', 'CANCELLED')),
  constraint workshop_jobs_priority_check check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  constraint workshop_jobs_estimated_minutes_check check (estimated_minutes is null or estimated_minutes between 5 and 1440),
  constraint workshop_jobs_customer_name_not_empty check (btrim(customer_name) <> ''),
  constraint workshop_jobs_vehicle_details_not_empty check (btrim(vehicle_details) <> ''),
  constraint workshop_jobs_service_type_not_empty check (btrim(service_type) <> '')
);

create index if not exists workshop_jobs_org_status_schedule_idx
  on public.workshop_jobs (organization_id, status, scheduled_for nulls last, created_at desc);
create index if not exists workshop_jobs_org_customer_idx
  on public.workshop_jobs (organization_id, customer_name);
create index if not exists workshop_jobs_org_registration_idx
  on public.workshop_jobs (organization_id, registration) where registration is not null;

create table if not exists public.workshop_job_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  job_id uuid not null references public.workshop_jobs(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  note text,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint workshop_job_events_type_check check (event_type in ('JOB_CREATED', 'STATUS_CHANGED', 'JOB_UPDATED', 'NOTE_ADDED', 'JOB_CANCELLED'))
);

create index if not exists workshop_job_events_job_created_idx
  on public.workshop_job_events (job_id, created_at desc);

create or replace function public.set_workshop_jobs_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_workshop_jobs_updated_at() from public;

drop trigger if exists set_workshop_jobs_updated_at on public.workshop_jobs;
create trigger set_workshop_jobs_updated_at
before update on public.workshop_jobs
for each row execute function public.set_workshop_jobs_updated_at();

alter table public.workshop_jobs enable row level security;
alter table public.workshop_job_events enable row level security;

revoke all on table public.workshop_jobs from anon, authenticated;
revoke all on table public.workshop_job_events from anon, authenticated;
grant select, insert, update, delete on table public.workshop_jobs to service_role;
grant select, insert, update, delete on table public.workshop_job_events to service_role;

drop policy if exists "service role manages organization workshop jobs" on public.workshop_jobs;
create policy "service role manages organization workshop jobs"
on public.workshop_jobs
for all
to service_role
using (organization_id = '8bbf5ea0-b71f-4c2a-a2c0-55ce7316e8c6'::uuid)
with check (organization_id = '8bbf5ea0-b71f-4c2a-a2c0-55ce7316e8c6'::uuid);

drop policy if exists "service role manages organization workshop events" on public.workshop_job_events;
create policy "service role manages organization workshop events"
on public.workshop_job_events
for all
to service_role
using (organization_id = '8bbf5ea0-b71f-4c2a-a2c0-55ce7316e8c6'::uuid)
with check (organization_id = '8bbf5ea0-b71f-4c2a-a2c0-55ce7316e8c6'::uuid);

comment on table public.workshop_jobs is
  'GP Tyres secure workshop workflow board. Browser clients cannot access it directly; server APIs enforce staff sessions.';
