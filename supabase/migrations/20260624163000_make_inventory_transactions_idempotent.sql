create or replace function public.process_inventory_transaction(
  p_stock_adjustments jsonb default '[]'::jsonb,
  p_sales_log_entries jsonb default '[]'::jsonb
)
returns setof public.inventory_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adjustment record;
  v_current public.inventory_items;
  v_new_quantity integer;
  v_requested_reference_count integer := 0;
  v_existing_reference_count integer := 0;
begin
  with requested_references as (
    select distinct nullif(trim(reference_id), '') as reference_id
    from jsonb_to_recordset(coalesce(p_sales_log_entries, '[]'::jsonb)) as x(reference_id text)
    where nullif(trim(reference_id), '') is not null
  )
  select count(*) into v_requested_reference_count
  from requested_references;

  if v_requested_reference_count > 0 then
    with requested_references as (
      select distinct nullif(trim(reference_id), '') as reference_id
      from jsonb_to_recordset(coalesce(p_sales_log_entries, '[]'::jsonb)) as x(reference_id text)
      where nullif(trim(reference_id), '') is not null
    )
    select count(*) into v_existing_reference_count
    from public.sales_log sl
    join requested_references rr on rr.reference_id = sl.reference_id;

    if v_existing_reference_count = v_requested_reference_count then
      return query
      select ii.*
      from public.inventory_items ii
      where ii.id in (
        select item_id
        from jsonb_to_recordset(coalesce(p_stock_adjustments, '[]'::jsonb)) as x(item_id text, delta integer)
        where item_id is not null
      );
      return;
    end if;

    if v_existing_reference_count > 0 then
      raise exception 'Transaction references were partially processed. Please refresh and review order history before retrying.';
    end if;
  end if;

  for v_adjustment in
    select item_id, sum(delta)::integer as delta
    from jsonb_to_recordset(coalesce(p_stock_adjustments, '[]'::jsonb)) as x(item_id text, delta integer)
    where item_id is not null and delta is not null and delta <> 0
    group by item_id
  loop
    select * into v_current
    from public.inventory_items
    where id = v_adjustment.item_id
    for update;

    if not found then
      raise exception 'Stock item % no longer exists', v_adjustment.item_id;
    end if;

    v_new_quantity := v_current.quantity + v_adjustment.delta;

    if v_new_quantity < 0 then
      raise exception 'Insufficient stock for %. Available %, requested %',
        v_adjustment.item_id,
        v_current.quantity,
        abs(v_adjustment.delta);
    end if;

    update public.inventory_items
    set
      quantity = v_new_quantity,
      item = item || jsonb_build_object(
        'quantity', v_new_quantity,
        'lastUpdated', to_char(current_date, 'YYYY-MM-DD')
      ),
      last_updated = current_date,
      updated_at = now()
    where id = v_adjustment.item_id;
  end loop;

  insert into public.sales_log (
    terminal_id,
    product_id,
    product_description,
    quantity,
    unit_price,
    total_amount,
    user_id,
    customer_name,
    reference_id
  )
  select
    terminal_id,
    product_id,
    product_description,
    quantity,
    unit_price,
    total_amount,
    user_id,
    customer_name,
    reference_id
  from jsonb_to_recordset(coalesce(p_sales_log_entries, '[]'::jsonb)) as x(
    terminal_id text,
    product_id text,
    product_description text,
    quantity integer,
    unit_price numeric,
    total_amount numeric,
    user_id text,
    customer_name text,
    reference_id text
  )
  where reference_id is not null
  on conflict (reference_id) do nothing;

  return query
  select ii.*
  from public.inventory_items ii
  where ii.id in (
    select item_id
    from jsonb_to_recordset(coalesce(p_stock_adjustments, '[]'::jsonb)) as x(item_id text, delta integer)
    where item_id is not null
  );
end;
$$;

grant execute on function public.process_inventory_transaction(jsonb, jsonb) to anon, authenticated;
