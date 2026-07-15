alter table public.supplier_catalog_items
  add column if not exists wheel_pcd text,
  add column if not exists wheel_offset text,
  add column if not exists wheel_center_bore text,
  add column if not exists stock_by_location jsonb not null default '{}'::jsonb;

alter table public.supplier_catalog_items
  drop constraint if exists supplier_catalog_items_stock_by_location_object_check;

alter table public.supplier_catalog_items
  add constraint supplier_catalog_items_stock_by_location_object_check
  check (jsonb_typeof(stock_by_location) = 'object');

comment on column public.supplier_catalog_items.wheel_pcd is
  'Supplier wheel pitch-circle diameter or bolt-pattern value.';
comment on column public.supplier_catalog_items.wheel_offset is
  'Supplier wheel offset/ET value.';
comment on column public.supplier_catalog_items.wheel_center_bore is
  'Supplier wheel centre-bore value.';
comment on column public.supplier_catalog_items.stock_by_location is
  'Per-location stock quantities retained alongside the consolidated supplier listing.';
