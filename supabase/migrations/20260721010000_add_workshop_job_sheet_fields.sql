alter table public.workshop_jobs
  add column if not exists agent text,
  add column if not exists job_date date not null default current_date,
  add column if not exists ticket_number text,
  add column if not exists paid_by text,
  add column if not exists attended_staff text;

comment on column public.workshop_jobs.agent is
  'The GP Tyres agent responsible for the workshop job.';
comment on column public.workshop_jobs.job_date is
  'The workshop job date shown on the job sheet.';
comment on column public.workshop_jobs.ticket_number is
  'The customer or workshop ticket reference.';
comment on column public.workshop_jobs.paid_by is
  'The recorded payment source or payer for the job.';
comment on column public.workshop_jobs.attended_staff is
  'The staff member who attended the customer or vehicle.';
