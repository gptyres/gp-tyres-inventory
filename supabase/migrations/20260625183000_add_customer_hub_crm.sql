create extension if not exists pgcrypto;

create or replace function public.set_crm_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_crm_updated_at() from public;

create table if not exists public.crm_customers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  display_name_key text generated always as (lower(btrim(display_name))) stored,
  company_name text,
  contact_name text,
  contact_email text,
  contact_phone text,
  mobile text,
  billing_address text,
  shipping_address text,
  vehicle_details text,
  notes text,
  customer_type text not null default 'CUSTOMER',
  status text not null default 'ACTIVE',
  source text not null default 'MANUAL',
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_customers_display_name_not_empty check (btrim(display_name) <> ''),
  constraint crm_customers_customer_type_check check (customer_type in ('CUSTOMER', 'LEAD')),
  constraint crm_customers_status_check check (status in ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);

create unique index if not exists crm_customers_display_name_key_uidx
  on public.crm_customers (display_name_key);

create unique index if not exists crm_customers_external_ref_uidx
  on public.crm_customers (external_ref)
  where external_ref is not null and btrim(external_ref) <> '';

create index if not exists crm_customers_customer_type_idx
  on public.crm_customers (customer_type);

create index if not exists crm_customers_updated_at_idx
  on public.crm_customers (updated_at desc);

create index if not exists crm_customers_search_idx
  on public.crm_customers
  using gin (
    to_tsvector(
      'simple',
      lower(
        coalesce(display_name, '') || ' ' ||
        coalesce(company_name, '') || ' ' ||
        coalesce(contact_name, '') || ' ' ||
        coalesce(contact_email, '') || ' ' ||
        coalesce(contact_phone, '') || ' ' ||
        coalesce(mobile, '') || ' ' ||
        coalesce(billing_address, '') || ' ' ||
        coalesce(vehicle_details, '')
      )
    )
  );

drop trigger if exists set_crm_customers_updated_at on public.crm_customers;
create trigger set_crm_customers_updated_at
before update on public.crm_customers
for each row
execute function public.set_crm_updated_at();

create table if not exists public.crm_documents (
  id uuid primary key default gen_random_uuid(),
  reference_id text not null,
  document_type text not null,
  status text not null default 'DRAFT',
  customer_id uuid references public.crm_customers(id) on delete set null,
  customer_snapshot jsonb not null default '{}'::jsonb,
  terminal_id text not null,
  staff_name text,
  vehicle_details text,
  subtotal numeric(12, 2) not null default 0,
  total_discount numeric(12, 2) not null default 0,
  tax_amount numeric(12, 2) not null default 0,
  grand_total numeric(12, 2) not null default 0,
  source text not null default 'POS',
  issued_at timestamptz not null default now(),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_documents_reference_id_key unique (reference_id),
  constraint crm_documents_document_type_check check (document_type in ('QUOTE', 'INVOICE')),
  constraint crm_documents_status_check check (status in ('DRAFT', 'ISSUED', 'SENT', 'ACCEPTED', 'CONVERTED', 'PAID', 'VOID')),
  constraint crm_documents_amounts_check check (
    subtotal >= 0
    and total_discount >= 0
    and tax_amount >= 0
    and grand_total >= 0
  )
);

create index if not exists crm_documents_customer_id_idx
  on public.crm_documents (customer_id);

create index if not exists crm_documents_reference_id_idx
  on public.crm_documents (reference_id);

create index if not exists crm_documents_type_status_idx
  on public.crm_documents (document_type, status);

create index if not exists crm_documents_issued_at_idx
  on public.crm_documents (issued_at desc);

drop trigger if exists set_crm_documents_updated_at on public.crm_documents;
create trigger set_crm_documents_updated_at
before update on public.crm_documents
for each row
execute function public.set_crm_updated_at();

create table if not exists public.crm_document_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.crm_documents(id) on delete cascade,
  line_index integer not null default 0,
  cart_line_type text not null,
  inventory_item_id text,
  product_type text,
  activity_code text,
  title text not null,
  description text,
  quantity numeric(10, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  discount_each numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  constraint crm_document_items_document_line_unique unique (document_id, line_index),
  constraint crm_document_items_title_not_empty check (btrim(title) <> ''),
  constraint crm_document_items_amounts_check check (
    quantity > 0
    and unit_price >= 0
    and discount_each >= 0
    and line_total >= 0
  )
);

create index if not exists crm_document_items_document_id_idx
  on public.crm_document_items (document_id);

create table if not exists public.crm_customer_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.crm_customers(id) on delete cascade,
  document_id uuid references public.crm_documents(id) on delete cascade,
  event_type text not null,
  notes text,
  amount numeric(12, 2),
  created_by text,
  created_at timestamptz not null default now(),
  constraint crm_customer_events_event_type_check check (
    event_type in ('CUSTOMER_CREATED', 'CUSTOMER_UPDATED', 'DOCUMENT_CREATED', 'DOCUMENT_UPDATED', 'IMPORT', 'NOTE')
  )
);

create index if not exists crm_customer_events_customer_id_idx
  on public.crm_customer_events (customer_id, created_at desc);

create index if not exists crm_customer_events_document_id_idx
  on public.crm_customer_events (document_id);

alter table public.crm_customers enable row level security;
alter table public.crm_documents enable row level security;
alter table public.crm_document_items enable row level security;
alter table public.crm_customer_events enable row level security;

grant select, insert, update, delete on table public.crm_customers to anon, authenticated, service_role;
grant select, insert, update, delete on table public.crm_documents to anon, authenticated, service_role;
grant select, insert, update, delete on table public.crm_document_items to anon, authenticated, service_role;
grant select, insert, update, delete on table public.crm_customer_events to anon, authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_customers' and policyname = 'anon can read crm customers') then
    create policy "anon can read crm customers" on public.crm_customers for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_customers' and policyname = 'anon can insert crm customers') then
    create policy "anon can insert crm customers" on public.crm_customers for insert to anon with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_customers' and policyname = 'anon can update crm customers') then
    create policy "anon can update crm customers" on public.crm_customers for update to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_customers' and policyname = 'anon can delete crm customers') then
    create policy "anon can delete crm customers" on public.crm_customers for delete to anon using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_documents' and policyname = 'anon can read crm documents') then
    create policy "anon can read crm documents" on public.crm_documents for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_documents' and policyname = 'anon can insert crm documents') then
    create policy "anon can insert crm documents" on public.crm_documents for insert to anon with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_documents' and policyname = 'anon can update crm documents') then
    create policy "anon can update crm documents" on public.crm_documents for update to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_documents' and policyname = 'anon can delete crm documents') then
    create policy "anon can delete crm documents" on public.crm_documents for delete to anon using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_document_items' and policyname = 'anon can read crm document items') then
    create policy "anon can read crm document items" on public.crm_document_items for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_document_items' and policyname = 'anon can insert crm document items') then
    create policy "anon can insert crm document items" on public.crm_document_items for insert to anon with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_document_items' and policyname = 'anon can update crm document items') then
    create policy "anon can update crm document items" on public.crm_document_items for update to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_document_items' and policyname = 'anon can delete crm document items') then
    create policy "anon can delete crm document items" on public.crm_document_items for delete to anon using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_customer_events' and policyname = 'anon can read crm customer events') then
    create policy "anon can read crm customer events" on public.crm_customer_events for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_customer_events' and policyname = 'anon can insert crm customer events') then
    create policy "anon can insert crm customer events" on public.crm_customer_events for insert to anon with check (true);
  end if;
end $$;
