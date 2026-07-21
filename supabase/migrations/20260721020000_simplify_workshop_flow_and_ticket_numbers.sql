-- Keep historical jobs, but consolidate the retired workflow lanes into the remaining ones.
update public.workshop_jobs
set status = 'CHECK_IN'
where status = 'BOOKED';

update public.workshop_jobs
set status = 'IN_PROGRESS'
where status = 'QUALITY_CHECK';

-- Manual ticket references remain supported. Blank ticket references receive a daily,
-- organization-scoped sequential ticket number before the row is stored.
create unique index if not exists workshop_jobs_organization_ticket_number_key
  on public.workshop_jobs (organization_id, ticket_number)
  where ticket_number is not null;

create or replace function public.set_workshop_ticket_number()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  ticket_date date := coalesce(new.job_date, current_date);
  ticket_prefix text := 'TKT-' || to_char(ticket_date, 'YYYYMMDD') || '-';
  next_sequence integer;
begin
  if nullif(btrim(new.ticket_number), '') is null then
    perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text || ':' || ticket_date::text, 0));

    select coalesce(max(nullif(substring(ticket_number from ('^' || ticket_prefix || '([0-9]+)$')), '')::integer), 0) + 1
      into next_sequence
      from public.workshop_jobs
     where organization_id = new.organization_id
       and ticket_number like ticket_prefix || '%';

    new.ticket_number := ticket_prefix || lpad(next_sequence::text, 3, '0');
  else
    new.ticket_number := btrim(new.ticket_number);
  end if;

  return new;
end;
$$;

revoke all on function public.set_workshop_ticket_number() from public;

drop trigger if exists set_workshop_ticket_number on public.workshop_jobs;
create trigger set_workshop_ticket_number
before insert on public.workshop_jobs
for each row execute function public.set_workshop_ticket_number();
