-- Separate staff-approved offers from replaceable catalogue snapshots.
create schema if not exists supplier_pricing;
revoke all on schema supplier_pricing from public, anon, authenticated;

create function supplier_pricing.offer_item_key(
  sku text, kind text, size text, brand text, location text
) returns text[]
language sql immutable strict
set search_path = ''
as $$
  select array[
    upper(trim(sku)),
    upper(trim(kind)),
    regexp_replace(replace(upper(size), 'ZR', 'R'), '[^A-Z0-9]', '', 'g'),
    regexp_replace(upper(brand), '[^A-Z0-9]', '', 'g'),
    case upper(trim(location))
      when 'CAPE TOWN' then 'CPT'
      when 'REGIONAL' then 'REG'
      when 'NATIONAL' then 'NAT'
      else upper(trim(location))
    end
  ];
$$;

create table supplier_pricing.dated_offers (
  catalog_key text not null,
  item_key text[] not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  special_cost numeric(12, 2) not null check (special_cost > 0),
  regular_cost numeric(12, 2) not null check (regular_cost > 0),
  source text not null,
  primary key (catalog_key, item_key),
  check (starts_at < ends_at)
);
alter table supplier_pricing.dated_offers enable row level security;
revoke all on supplier_pricing.dated_offers from public, anon, authenticated;

with captured as (
  select i.catalog_key, i.cost_price, i.imported_at, i.id,
    supplier_pricing.offer_item_key(i.supplier_sku, i.product_type, i.size, i.brand, i.stock_location) as item_key,
    (regexp_match(i.source_stock_detail, '"gp_supplier_special_v1"[[:space:]]*:[[:space:]]*([{][^{}]*[}])'))[1]::jsonb as offer
  from public.supplier_catalog_items i
  where i.catalog_key in ('EXCLUSIVE_TYRES_NEW', 'TREADS_UNLIMITED')
    and i.cost_price > 0
    and i.source_stock_detail like '%"gp_supplier_special_v1"%'
)
insert into supplier_pricing.dated_offers
  (catalog_key, item_key, starts_at, ends_at, special_cost, regular_cost, source)
select distinct on (catalog_key, item_key)
  catalog_key, item_key, (offer->>'startsAt')::timestamptz, (offer->>'endsAt')::timestamptz,
  (offer->>'costExVat')::numeric, cost_price, offer->>'source'
from captured
where item_key is not null
  and offer->>'source' in ('Exclusive Tyres 2 November quotation', 'Radar Red Black November',
    'Windforce November Special Offer', 'Hankook November Specials')
  and (offer->>'endsAt')::timestamptz = '2026-12-01 00:00:00+02'::timestamptz
order by catalog_key, item_key, imported_at desc, id desc;

create function supplier_pricing.carry_offers_into_snapshot()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.active_snapshot_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.active_snapshot_id is not distinct from new.active_snapshot_id then return new; end if;
  if not exists (
    select 1 from supplier_pricing.dated_offers p
    where p.catalog_key = new.catalog_key and p.ends_at > statement_timestamp()
  ) then return new; end if;

  with patched as (
    update public.supplier_catalog_items i
    set source_stock_detail = case
      when pg_input_is_valid(i.source_stock_detail, 'jsonb') then
        case when jsonb_typeof(i.source_stock_detail::jsonb) = 'object'
          then (i.source_stock_detail::jsonb || marker.detail)::text
          else concat_ws(' | ', nullif(i.source_stock_detail, ''), marker.detail::text)
        end
      else concat_ws(' | ', nullif(i.source_stock_detail, ''), marker.detail::text)
      end,
      -- A portal can publish the offer as its only price. Do not treat that
      -- as a new regular price or leave it in place after the offer ends.
      cost_price = case when abs(i.cost_price - p.special_cost) <= 0.01
        then p.regular_cost else i.cost_price end
    from supplier_pricing.dated_offers p
    cross join lateral (
      select jsonb_build_object('gp_supplier_special_v1', jsonb_build_object(
        'costExVat', p.special_cost, 'startsAt', p.starts_at, 'endsAt', p.ends_at, 'source', p.source
      )) as detail
    ) marker
    where p.catalog_key = new.catalog_key and p.ends_at > statement_timestamp()
      and i.catalog_key = p.catalog_key and i.snapshot_id = new.active_snapshot_id
      and p.item_key = supplier_pricing.offer_item_key(i.supplier_sku, i.product_type, i.size, i.brand, i.stock_location)
    returning p.catalog_key, p.item_key, i.cost_price
  ), normal_prices as (
    select catalog_key, item_key, min(cost_price) as cost
    from patched
    group by catalog_key, item_key
    having min(cost_price) = max(cost_price) and min(cost_price) > 0
  )
  update supplier_pricing.dated_offers p set regular_cost = n.cost
  from normal_prices n
  where p.catalog_key = n.catalog_key and p.item_key = n.item_key
    and p.regular_cost is distinct from n.cost;
  return new;
end;
$$;

revoke execute on function supplier_pricing.carry_offers_into_snapshot() from public, anon, authenticated;
create trigger supplier_catalog_sources_carry_dated_offers
after insert or update of active_snapshot_id on public.supplier_catalog_sources
for each row execute function supplier_pricing.carry_offers_into_snapshot();
