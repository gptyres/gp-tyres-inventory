drop policy if exists "anon can insert crm customers" on public.crm_customers;
drop policy if exists "anon can update crm customers" on public.crm_customers;
drop policy if exists "anon can delete crm customers" on public.crm_customers;

create policy "anon can insert valid crm customers"
on public.crm_customers
for insert
to anon
with check (
  btrim(display_name) <> ''
  and customer_type in ('CUSTOMER', 'LEAD')
  and status in ('ACTIVE', 'INACTIVE', 'ARCHIVED')
);

create policy "anon can update active crm customers"
on public.crm_customers
for update
to anon
using (status <> 'ARCHIVED')
with check (
  btrim(display_name) <> ''
  and customer_type in ('CUSTOMER', 'LEAD')
  and status in ('ACTIVE', 'INACTIVE', 'ARCHIVED')
);

drop policy if exists "anon can insert crm documents" on public.crm_documents;
drop policy if exists "anon can update crm documents" on public.crm_documents;
drop policy if exists "anon can delete crm documents" on public.crm_documents;

create policy "anon can insert valid crm documents"
on public.crm_documents
for insert
to anon
with check (
  btrim(reference_id) <> ''
  and btrim(terminal_id) <> ''
  and document_type in ('QUOTE', 'INVOICE')
  and status in ('DRAFT', 'ISSUED', 'SENT', 'ACCEPTED', 'CONVERTED', 'PAID', 'VOID')
  and subtotal >= 0
  and total_discount >= 0
  and tax_amount >= 0
  and grand_total >= 0
);

create policy "anon can update non-void crm documents"
on public.crm_documents
for update
to anon
using (status <> 'VOID')
with check (
  btrim(reference_id) <> ''
  and btrim(terminal_id) <> ''
  and document_type in ('QUOTE', 'INVOICE')
  and status in ('DRAFT', 'ISSUED', 'SENT', 'ACCEPTED', 'CONVERTED', 'PAID', 'VOID')
  and subtotal >= 0
  and total_discount >= 0
  and tax_amount >= 0
  and grand_total >= 0
);

drop policy if exists "anon can insert crm document items" on public.crm_document_items;
drop policy if exists "anon can update crm document items" on public.crm_document_items;
drop policy if exists "anon can delete crm document items" on public.crm_document_items;

create policy "anon can insert valid crm document items"
on public.crm_document_items
for insert
to anon
with check (
  document_id is not null
  and btrim(title) <> ''
  and quantity > 0
  and unit_price >= 0
  and discount_each >= 0
  and line_total >= 0
);

create policy "anon can update valid crm document items"
on public.crm_document_items
for update
to anon
using (document_id is not null)
with check (
  document_id is not null
  and btrim(title) <> ''
  and quantity > 0
  and unit_price >= 0
  and discount_each >= 0
  and line_total >= 0
);

create policy "anon can delete crm document items for resave"
on public.crm_document_items
for delete
to anon
using (document_id is not null);

drop policy if exists "anon can insert crm customer events" on public.crm_customer_events;

create policy "anon can insert valid crm customer events"
on public.crm_customer_events
for insert
to anon
with check (
  event_type in ('CUSTOMER_CREATED', 'CUSTOMER_UPDATED', 'DOCUMENT_CREATED', 'DOCUMENT_UPDATED', 'IMPORT', 'NOTE')
);

revoke delete on table public.crm_customers from anon, authenticated;
revoke delete on table public.crm_documents from anon, authenticated;
