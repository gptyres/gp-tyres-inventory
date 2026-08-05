alter table public.supplier_catalog_items
  add column if not exists supplier_lead_time text;

comment on column public.supplier_catalog_items.supplier_lead_time is
  'Supplier-provided fulfilment SLA, such as 6 Hours or 7 Days.';
