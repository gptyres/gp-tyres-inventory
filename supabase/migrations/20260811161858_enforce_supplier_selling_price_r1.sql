-- Keep every supplier selling price VAT-inclusive and rounded to the nearest rand.
-- ALINE, NDT and WHEEL_TECH already provide customer-facing VAT-inclusive prices,
-- so those catalogues are rounded without adding VAT a second time.
create or replace function public.enforce_supplier_selling_price_r1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.selling_price := case
    when new.catalog_key in ('ALINE', 'NDT', 'WHEEL_TECH')
      or coalesce(new.cost_price, 0) <= 0
      then round(greatest(coalesce(new.selling_price, 0), 0), 0)
    else round(greatest(new.cost_price, 0) * 1.15, 0)
  end;

  return new;
end;
$$;

drop trigger if exists enforce_supplier_selling_price_r1
  on public.supplier_catalog_items;

create trigger enforce_supplier_selling_price_r1
before insert or update of catalog_key, cost_price, selling_price
on public.supplier_catalog_items
for each row
execute function public.enforce_supplier_selling_price_r1();

comment on function public.enforce_supplier_selling_price_r1() is
  'Applies 15% VAT once to supplier ex-VAT cost and rounds the selling price to the nearest rand.';

update public.supplier_catalog_items
set selling_price = case
  when catalog_key in ('ALINE', 'NDT', 'WHEEL_TECH')
    or coalesce(cost_price, 0) <= 0
    then round(greatest(coalesce(selling_price, 0), 0), 0)
  else round(greatest(cost_price, 0) * 1.15, 0)
end;
