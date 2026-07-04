create table if not exists public.training_progress (
  staff_name text primary key,
  tasks jsonb not null default '{}'::jsonb,
  terminal_id text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_progress_staff_name_not_empty check (btrim(staff_name) <> ''),
  constraint training_progress_tasks_is_object check (jsonb_typeof(tasks) = 'object')
);

create index if not exists training_progress_updated_at_idx
  on public.training_progress (updated_at desc);

create or replace function public.set_training_progress_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_training_progress_updated_at() from public;

drop trigger if exists set_training_progress_updated_at on public.training_progress;
create trigger set_training_progress_updated_at
before update on public.training_progress
for each row
execute function public.set_training_progress_updated_at();

alter table public.training_progress enable row level security;
alter table public.training_progress replica identity full;

grant select, insert, update, delete on table public.training_progress to anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'training_progress'
      and policyname = 'anon can read training progress'
  ) then
    create policy "anon can read training progress"
    on public.training_progress
    for select
    to anon
    using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'training_progress'
      and policyname = 'anon can insert training progress'
  ) then
    create policy "anon can insert training progress"
    on public.training_progress
    for insert
    to anon
    with check (btrim(staff_name) <> '');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'training_progress'
      and policyname = 'anon can update training progress'
  ) then
    create policy "anon can update training progress"
    on public.training_progress
    for update
    to anon
    using (true)
    with check (btrim(staff_name) <> '');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'training_progress'
      and policyname = 'anon can delete training progress'
  ) then
    create policy "anon can delete training progress"
    on public.training_progress
    for delete
    to anon
    using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'training_progress'
      and policyname = 'authenticated can manage training progress'
  ) then
    create policy "authenticated can manage training progress"
    on public.training_progress
    for all
    to authenticated
    using (true)
    with check (btrim(staff_name) <> '');
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'training_progress'
    )
  then
    alter publication supabase_realtime add table public.training_progress;
  end if;
end $$;
