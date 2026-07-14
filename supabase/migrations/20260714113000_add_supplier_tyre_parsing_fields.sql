alter table public.supplier_catalog_items
  add column if not exists tyre_pattern text,
  add column if not exists tyre_rating text,
  add column if not exists tyre_index text,
  add column if not exists tyre_specs text;

comment on column public.supplier_catalog_items.tyre_pattern is
  'Tyre tread pattern parsed from a supplier portal or uploaded stock document.';

comment on column public.supplier_catalog_items.tyre_rating is
  'Tyre ply/rating value such as 18PR parsed from supplier stock.';

comment on column public.supplier_catalog_items.tyre_index is
  'Tyre load and speed index such as 149/146K parsed from supplier stock.';

comment on column public.supplier_catalog_items.tyre_specs is
  'Additional tyre specifications such as TL, OWL, or A/T parsed from supplier stock.';
