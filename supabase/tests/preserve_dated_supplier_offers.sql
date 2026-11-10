-- Exercise actual snapshot activation triggers without committing fixture data.
do $$
declare
  job uuid;
  catalog text := 'OFFER_TEST_' || gen_random_uuid()::text;
  first_snapshot uuid;
  second_snapshot uuid;
  third_snapshot uuid;
begin
  select job_id into strict job from public.supplier_catalog_snapshots limit 1;
  begin
    insert into supplier_pricing.dated_offers
      (catalog_key, item_key, starts_at, ends_at, special_cost, regular_cost, source)
    values (catalog, array['TEST-SKU','TYRE','20555R16','FIREMAX','CPT'],
      now() - interval '1 day', now() + interval '1 day', 545, 1609.50, 'test');

    insert into public.supplier_catalog_snapshots (job_id, catalog_key, registry_supplier)
      values (job, catalog, 'test') returning id into first_snapshot;
    insert into public.supplier_catalog_snapshots (job_id, catalog_key, registry_supplier)
      values (job, catalog, 'test') returning id into second_snapshot;
    insert into public.supplier_catalog_snapshots (job_id, catalog_key, registry_supplier)
      values (job, catalog, 'test') returning id into third_snapshot;

    insert into public.supplier_catalog_items
      (snapshot_id,catalog_key,source_key,supplier,supplier_sku,brand,product_name,size,stock_location,stock_units,cost_price,source_file,source_stock_detail)
    values
      (first_snapshot,catalog,'cpt','test','TEST-SKU','Firemax','test','205/55R16','Cape Town',17,1620,'test','{"previous":"keep"}'),
      (second_snapshot,catalog,'different-import-key','test','test-sku','FIREMAX','test','205/55ZR16','CPT',22,545,'test','other existing detail'),
      (second_snapshot,catalog,'jhb','test','test-sku','FIREMAX','test','205/55R16','JHB',12,500,'test','{}'),
      (second_snapshot,catalog,'different-size','test','test-sku','FIREMAX','test','225/55R16','CPT',4,500,'test','{}'),
      (third_snapshot,catalog,'cpt','test','TEST-SKU','Firemax','test','205/55R16','Cape Town',8,1650,'test','{}');

    insert into public.supplier_catalog_sources (catalog_key,registry_supplier,active_snapshot_id)
      values (catalog,'test',first_snapshot);
    if not exists (
      select 1 from public.supplier_catalog_items where snapshot_id = first_snapshot
        and cost_price = 1620 and stock_units = 17
        and source_stock_detail::jsonb->>'previous' = 'keep'
        and source_stock_detail::jsonb->'gp_supplier_special_v1'->>'costExVat' = '545.00'
    ) then raise exception 'First activation did not preserve regular price, stock and source detail'; end if;

    update public.supplier_catalog_sources set active_snapshot_id = second_snapshot where catalog_key = catalog;
    if not exists (
      select 1 from public.supplier_catalog_items where snapshot_id = second_snapshot and source_key = 'different-import-key'
        and cost_price = 1620 and selling_price = 1863 and stock_units = 22
        and source_stock_detail like 'other existing detail | %"gp_supplier_special_v1"%'
    ) then raise exception 'Refresh at the special cost did not restore the latest regular price'; end if;
    if exists (
      select 1 from public.supplier_catalog_items where snapshot_id = second_snapshot
        and source_key in ('jhb', 'different-size') and source_stock_detail like '%gp_supplier_special_v1%'
    ) then raise exception 'Offer leaked to another branch or size'; end if;

    update supplier_pricing.dated_offers set starts_at = now() - interval '2 days', ends_at = now() - interval '1 day'
      where catalog_key = catalog;
    update public.supplier_catalog_sources set active_snapshot_id = third_snapshot where catalog_key = catalog;
    if not exists (
      select 1 from public.supplier_catalog_items where snapshot_id = third_snapshot
        and cost_price = 1650 and stock_units = 8 and source_stock_detail not like '%gp_supplier_special_v1%'
    ) then raise exception 'Expired offer carried into a new snapshot'; end if;

    raise sqlstate 'ZX001' using message = 'Rollback passing fixtures';
  exception when sqlstate 'ZX001' then
    raise notice 'Snapshot refresh and expired-offer assertions passed; fixtures rolled back.';
  end;
end;
$$;
