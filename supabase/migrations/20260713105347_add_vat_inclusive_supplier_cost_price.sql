alter table public.supplier_catalog_items
  add column if not exists cost_price numeric(12,2) not null default 0;

update public.supplier_catalog_items
set cost_price = selling_price
where cost_price = 0
  and selling_price > 0;

alter table public.supplier_catalog_items
  drop constraint if exists supplier_catalog_items_cost_price_check;

alter table public.supplier_catalog_items
  add constraint supplier_catalog_items_cost_price_check
  check (cost_price >= 0);

comment on column public.supplier_catalog_items.cost_price is
  'VAT-inclusive supplier cost captured by the latest supplier sync.';
