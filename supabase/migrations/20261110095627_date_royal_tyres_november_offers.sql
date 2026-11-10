-- Zero means the supplier has not confirmed a regular price for this offer.
alter table supplier_pricing.dated_offers drop constraint dated_offers_regular_cost_check;
alter table supplier_pricing.dated_offers add constraint dated_offers_regular_cost_check check (regular_cost >= 0);

create function supplier_pricing.royal_cpt_offer_key(i public.supplier_catalog_items)
returns text[]
language sql immutable
set search_path = ''
as $$
  select supplier_pricing.offer_item_key(
    case when nullif(trim(i.supplier_sku), '') is not null then 'SKU:' || trim(i.supplier_sku)
      else 'NAME:' || regexp_replace(upper(i.product_name), '[^A-Z0-9]', '', 'g') end,
    i.product_type, i.size, i.brand, 'CPT'
  )
  where trim(i.stock_location) ~* '^(CPT|CAPE TOWN)(:[[:space:]]*[0-9]+[+]?)?$';
$$;

create function supplier_pricing.apply_royal_cpt_offers(p_snapshot uuid)
returns integer
language sql
set search_path = ''
as $$
  with matches as (
    select i.id, p.item_key, p.starts_at, p.ends_at, p.special_cost, p.regular_cost, p.source,
      count(*) over (partition by p.item_key) as match_count,
      coalesce(i.tyre_specs, '') ~* 'SPECIAL[[:space:]]+NOVEMBER[[:space:]]+2026'
        or abs(i.cost_price - p.special_cost) <= 0.01 as imported_offer
    from public.supplier_catalog_items i
    join supplier_pricing.dated_offers p on p.catalog_key = i.catalog_key
      and p.item_key = supplier_pricing.royal_cpt_offer_key(i)
    where i.catalog_key = 'ROYAL_TYRES' and i.snapshot_id = p_snapshot
  ), patched as (
    update public.supplier_catalog_items i
    set source_stock_detail = case
      when pg_input_is_valid(i.source_stock_detail, 'jsonb') then
        case when jsonb_typeof(i.source_stock_detail::jsonb) = 'object'
          then (i.source_stock_detail::jsonb || marker.detail)::text
          else concat_ws(' | ', nullif(i.source_stock_detail, ''), marker.detail::text)
        end
      else concat_ws(' | ', nullif(i.source_stock_detail, ''), marker.detail::text)
      end,
      cost_price = case when m.imported_offer then m.regular_cost else i.cost_price end,
      selling_price = case when m.imported_offer and m.regular_cost = 0 then 0 else i.selling_price end
    from matches m cross join lateral (
      select jsonb_build_object('gp_supplier_special_v1', jsonb_build_object(
        'costExVat', m.special_cost, 'startsAt', m.starts_at, 'endsAt', m.ends_at, 'source', m.source
      )) as detail
    ) marker
    where i.id = m.id and m.match_count = 1
    returning m.item_key, i.cost_price
  ), normal_prices as (
    update supplier_pricing.dated_offers p set regular_cost = n.cost_price
    from patched n
    where p.catalog_key = 'ROYAL_TYRES' and p.item_key = n.item_key
      and n.cost_price > 0 and p.regular_cost is distinct from n.cost_price
  )
  select count(*)::integer from patched;
$$;

create function supplier_pricing.carry_royal_offers_into_snapshot()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.active_snapshot_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.active_snapshot_id is not distinct from new.active_snapshot_id then return new; end if;
  perform supplier_pricing.apply_royal_cpt_offers(new.active_snapshot_id);
  return new;
end;
$$;

revoke execute on function supplier_pricing.royal_cpt_offer_key(public.supplier_catalog_items) from public, anon, authenticated;
revoke execute on function supplier_pricing.apply_royal_cpt_offers(uuid) from public, anon, authenticated;
revoke execute on function supplier_pricing.carry_royal_offers_into_snapshot() from public, anon, authenticated;

do $$
declare
  snapshot uuid;
  seeded integer;
begin
  select active_snapshot_id into strict snapshot from public.supplier_catalog_sources
    where catalog_key = 'ROYAL_TYRES' for share;
  insert into supplier_pricing.dated_offers
    (catalog_key, item_key, starts_at, ends_at, special_cost, regular_cost, source)
  select i.catalog_key, supplier_pricing.royal_cpt_offer_key(i),
    '2026-11-01 00:00:00+02'::timestamptz, '2026-12-01 00:00:00+02'::timestamptz,
    i.cost_price, 0, 'Royal Tyres Cape Town November 2026 price list'
  from public.supplier_catalog_items i
  where i.catalog_key = 'ROYAL_TYRES' and i.snapshot_id = snapshot
    and i.tyre_specs ilike '%SPECIAL NOVEMBER 2026%'
    and i.cost_price > 0 and i.selling_price = round(i.cost_price * 1.15)
    and supplier_pricing.royal_cpt_offer_key(i) is not null;
  get diagnostics seeded = row_count;
  if seeded <> 248 or supplier_pricing.apply_royal_cpt_offers(snapshot) <> seeded then
    raise exception 'Royal Tyres November offer identity or price validation failed; no changes made';
  end if;
end;
$$;

create trigger supplier_catalog_sources_carry_royal_cpt_offers
after insert or update of active_snapshot_id on public.supplier_catalog_sources
for each row when (new.catalog_key = 'ROYAL_TYRES')
execute function supplier_pricing.carry_royal_offers_into_snapshot();
