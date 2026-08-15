create schema if not exists private;

create table if not exists public.inventory_change_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '8bbf5ea0-b71f-4c2a-a2c0-55ce7316e8c6'::uuid,
  product_id text not null,
  product_type text not null,
  product_snapshot jsonb not null default '{}'::jsonb,
  event_type text not null check (event_type in ('SALE', 'REFUND', 'RESERVE', 'RESTOCK', 'EDIT', 'ADD', 'DELETE')),
  source text not null check (source in ('GOOGLE_SHEET', 'PORTAL', 'POS', 'BACKFILL', 'SYSTEM')),
  quantity_before integer,
  quantity_after integer,
  quantity_delta integer not null default 0,
  cost_price_at_change numeric(12, 2) not null default 0,
  selling_price_at_change numeric(12, 2) not null default 0,
  changed_fields text[] not null default '{}'::text[],
  old_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  staff_name text,
  terminal_id text,
  editor_email text,
  editor_display_name text,
  reference_id text,
  sheet_row_number integer,
  sync_run_id uuid references public.sheet_inventory_sync_runs(id) on delete set null,
  confidence text not null default 'VERIFIED' check (confidence in ('VERIFIED', 'RECONSTRUCTED')),
  dedupe_key text not null unique,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_history_backfill_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '8bbf5ea0-b71f-4c2a-a2c0-55ce7316e8c6'::uuid,
  spreadsheet_id text not null,
  sheet_name text not null,
  range_start date not null,
  range_end date not null,
  status text not null default 'started' check (status in ('started', 'completed', 'partial', 'failed')),
  revisions_discovered integer not null default 0,
  revisions_downloaded integer not null default 0,
  events_detected integer not null default 0,
  events_imported integer not null default 0,
  events_skipped integer not null default 0,
  report jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists inventory_change_events_product_time_idx
  on public.inventory_change_events (product_id, occurred_at desc);
create index if not exists inventory_change_events_time_idx
  on public.inventory_change_events (occurred_at desc);
create index if not exists inventory_change_events_sales_time_idx
  on public.inventory_change_events (event_type, occurred_at desc)
  where event_type in ('SALE', 'REFUND', 'RESERVE', 'RESTOCK');
create index if not exists inventory_change_events_source_time_idx
  on public.inventory_change_events (source, occurred_at desc);
create index if not exists inventory_change_events_sync_run_idx
  on public.inventory_change_events (sync_run_id)
  where sync_run_id is not null;

alter table public.inventory_change_events enable row level security;
alter table public.inventory_history_backfill_runs enable row level security;
revoke all on table public.inventory_change_events from public, anon, authenticated;
revoke all on table public.inventory_history_backfill_runs from public, anon, authenticated;
grant select, insert, update, delete on table public.inventory_change_events to service_role;
grant select, insert, update, delete on table public.inventory_history_backfill_runs to service_role;

create or replace function private.capture_inventory_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context jsonb := '{}'::jsonb;
  v_old_snapshot jsonb := '{}'::jsonb;
  v_new_snapshot jsonb := '{}'::jsonb;
  v_old_compare jsonb := '{}'::jsonb;
  v_new_compare jsonb := '{}'::jsonb;
  v_changed_fields text[] := '{}'::text[];
  v_old_values jsonb := '{}'::jsonb;
  v_new_values jsonb := '{}'::jsonb;
  v_product_id text;
  v_product_type text;
  v_event_type text;
  v_source text;
  v_confidence text;
  v_quantity_before integer;
  v_quantity_after integer;
  v_quantity_delta integer := 0;
  v_cost_price numeric(12, 2) := 0;
  v_selling_price numeric(12, 2) := 0;
  v_occurred_at timestamptz := now();
  v_dedupe_key text;
  v_sheet_row integer;
  v_sync_run uuid;
begin
  begin
    v_context := coalesce(nullif(current_setting('gp.inventory_audit_context', true), '')::jsonb, '{}'::jsonb);
  exception when others then
    v_context := '{}'::jsonb;
  end;

  if tg_op <> 'INSERT' then
    v_old_snapshot := coalesce(old.item, '{}'::jsonb) || jsonb_build_object(
      'id', old.id,
      'type', old.type,
      'quantity', old.quantity,
      'sellingPrice', old.selling_price,
      'costPrice', old.cost_price
    );
  end if;

  if tg_op <> 'DELETE' then
    v_new_snapshot := coalesce(new.item, '{}'::jsonb) || jsonb_build_object(
      'id', new.id,
      'type', new.type,
      'quantity', new.quantity,
      'sellingPrice', new.selling_price,
      'costPrice', new.cost_price
    );
  end if;

  v_old_compare := v_old_snapshot - array['lastUpdated', 'sheetSyncedAt', 'sheetFingerprint']::text[];
  v_new_compare := v_new_snapshot - array['lastUpdated', 'sheetSyncedAt', 'sheetFingerprint']::text[];

  if tg_op = 'UPDATE' and v_old_compare = v_new_compare then
    return new;
  end if;

  select coalesce(array_agg(keys.key order by keys.key), '{}'::text[])
    into v_changed_fields
  from (
    select jsonb_object_keys(v_old_compare) as key
    union
    select jsonb_object_keys(v_new_compare) as key
  ) keys
  where v_old_compare -> keys.key is distinct from v_new_compare -> keys.key;

  select coalesce(jsonb_object_agg(changed.key, coalesce(v_old_compare -> changed.key, 'null'::jsonb)), '{}'::jsonb),
         coalesce(jsonb_object_agg(changed.key, coalesce(v_new_compare -> changed.key, 'null'::jsonb)), '{}'::jsonb)
    into v_old_values, v_new_values
  from unnest(v_changed_fields) as changed(key);

  if tg_op = 'DELETE' then
    v_product_id := old.id;
    v_product_type := old.type;
    v_quantity_before := old.quantity;
    v_quantity_after := null;
    v_cost_price := old.cost_price;
    v_selling_price := old.selling_price;
  elsif tg_op = 'INSERT' then
    v_product_id := new.id;
    v_product_type := new.type;
    v_quantity_before := null;
    v_quantity_after := new.quantity;
    v_cost_price := new.cost_price;
    v_selling_price := new.selling_price;
  else
    v_product_id := new.id;
    v_product_type := new.type;
    v_quantity_before := old.quantity;
    v_quantity_after := new.quantity;
    v_cost_price := new.cost_price;
    v_selling_price := new.selling_price;
  end if;
  v_quantity_delta := coalesce(v_quantity_after, 0) - coalesce(v_quantity_before, 0);
  v_source := upper(coalesce(nullif(v_context ->> 'source', ''), 'SYSTEM'));
  if v_source not in ('GOOGLE_SHEET', 'PORTAL', 'POS', 'BACKFILL', 'SYSTEM') then
    v_source := 'SYSTEM';
  end if;
  v_confidence := upper(coalesce(nullif(v_context ->> 'confidence', ''), 'VERIFIED'));
  if v_confidence not in ('VERIFIED', 'RECONSTRUCTED') then
    v_confidence := 'VERIFIED';
  end if;

  v_event_type := upper(coalesce(nullif(v_context ->> 'eventType', ''), ''));
  if tg_op = 'INSERT' then
    v_event_type := 'ADD';
  elsif tg_op = 'DELETE' then
    v_event_type := 'DELETE';
  elsif v_event_type not in ('SALE', 'REFUND', 'RESERVE', 'RESTOCK', 'EDIT', 'ADD', 'DELETE') then
    if v_source = 'GOOGLE_SHEET' and v_quantity_delta < 0 then
      v_event_type := 'SALE';
    elsif v_source = 'GOOGLE_SHEET' and v_quantity_delta > 0 then
      v_event_type := 'RESTOCK';
    else
      v_event_type := 'EDIT';
    end if;
  end if;

  if nullif(v_context ->> 'occurredAt', '') is not null then
    v_occurred_at := (v_context ->> 'occurredAt')::timestamptz;
  end if;
  v_sheet_row := coalesce(
    nullif(v_context ->> 'sheetRowNumber', '')::integer,
    nullif(v_new_snapshot ->> 'sheetRowNumber', '')::integer,
    nullif(v_old_snapshot ->> 'sheetRowNumber', '')::integer
  );
  if nullif(v_context ->> 'syncRunId', '') is not null then
    v_sync_run := (v_context ->> 'syncRunId')::uuid;
  end if;

  v_dedupe_key := nullif(v_context ->> 'dedupeKey', '');
  if v_dedupe_key is null then
    v_dedupe_key := concat_ws(
      ':',
      coalesce(nullif(v_context ->> 'dedupePrefix', ''), 'tx-' || txid_current()::text),
      v_product_id,
      v_event_type,
      coalesce(v_quantity_before::text, 'null'),
      coalesce(v_quantity_after::text, 'null')
    );
  end if;

  insert into public.inventory_change_events (
    product_id,
    product_type,
    product_snapshot,
    event_type,
    source,
    quantity_before,
    quantity_after,
    quantity_delta,
    cost_price_at_change,
    selling_price_at_change,
    changed_fields,
    old_values,
    new_values,
    staff_name,
    terminal_id,
    editor_email,
    editor_display_name,
    reference_id,
    sheet_row_number,
    sync_run_id,
    confidence,
    dedupe_key,
    occurred_at,
    metadata
  ) values (
    v_product_id,
    v_product_type,
    case when tg_op = 'DELETE' then v_old_snapshot else v_new_snapshot end,
    v_event_type,
    v_source,
    v_quantity_before,
    v_quantity_after,
    v_quantity_delta,
    v_cost_price,
    v_selling_price,
    v_changed_fields,
    v_old_values,
    v_new_values,
    nullif(v_context ->> 'staffName', ''),
    nullif(v_context ->> 'terminalId', ''),
    nullif(v_context ->> 'editorEmail', ''),
    nullif(v_context ->> 'editorDisplayName', ''),
    nullif(v_context ->> 'referenceId', ''),
    v_sheet_row,
    v_sync_run,
    v_confidence,
    v_dedupe_key,
    v_occurred_at,
    v_context
  )
  on conflict (dedupe_key) do nothing;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.capture_inventory_change() from public, anon, authenticated;

drop trigger if exists inventory_items_capture_history on public.inventory_items;
create trigger inventory_items_capture_history
after insert or update or delete on public.inventory_items
for each row execute function private.capture_inventory_change();

create or replace function public.upsert_inventory_item_audited(
  p_item jsonb,
  p_audit_context jsonb default '{}'::jsonb
)
returns public.inventory_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.inventory_items;
begin
  perform set_config(
    'gp.inventory_audit_context',
    (coalesce(p_audit_context, '{}'::jsonb) || jsonb_build_object('source', coalesce(nullif(p_audit_context ->> 'source', ''), 'PORTAL')))::text,
    true
  );
  v_row := public.upsert_inventory_item(p_item);
  return v_row;
end;
$$;

create or replace function public.delete_inventory_item_audited(
  p_item_id text,
  p_audit_context jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config(
    'gp.inventory_audit_context',
    (coalesce(p_audit_context, '{}'::jsonb) || jsonb_build_object('source', coalesce(nullif(p_audit_context ->> 'source', ''), 'PORTAL'), 'eventType', 'DELETE'))::text,
    true
  );
  perform public.delete_inventory_item(p_item_id);
end;
$$;

create or replace function public.sync_inventory_items_audited(
  p_items jsonb,
  p_delete_ids jsonb default '[]'::jsonb,
  p_audit_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_upserted integer := 0;
  v_deleted integer := 0;
begin
  perform set_config(
    'gp.inventory_audit_context',
    (coalesce(p_audit_context, '{}'::jsonb) || jsonb_build_object('source', 'GOOGLE_SHEET'))::text,
    true
  );

  insert into public.inventory_items (id, type, item, quantity, selling_price, cost_price, last_updated, updated_at)
  select
    x.id,
    x.type,
    x.item,
    greatest(0, x.quantity),
    greatest(0, x.selling_price),
    greatest(0, x.cost_price),
    x.last_updated,
    now()
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(
    id text,
    type text,
    item jsonb,
    quantity integer,
    selling_price numeric,
    cost_price numeric,
    last_updated date
  )
  on conflict (id) do update set
    type = excluded.type,
    item = excluded.item,
    quantity = excluded.quantity,
    selling_price = excluded.selling_price,
    cost_price = excluded.cost_price,
    last_updated = excluded.last_updated,
    updated_at = now();
  get diagnostics v_upserted = row_count;

  delete from public.inventory_items
  where type = 'TYRE'
    and id in (
      select entry.value #>> '{}'
      from jsonb_array_elements(coalesce(p_delete_ids, '[]'::jsonb)) as entry(value)
    );
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('upserted', v_upserted, 'deleted', v_deleted);
end;
$$;

create or replace function public.process_inventory_transaction(
  p_stock_adjustments jsonb default '[]'::jsonb,
  p_sales_log_entries jsonb default '[]'::jsonb
)
returns setof public.inventory_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_adjustment record;
  v_current public.inventory_items;
  v_sale record;
  v_new_quantity integer;
  v_requested_reference_count integer := 0;
  v_existing_reference_count integer := 0;
  v_event_type text;
begin
  with requested_references as (
    select distinct nullif(trim(reference_id), '') as reference_id
    from jsonb_to_recordset(coalesce(p_sales_log_entries, '[]'::jsonb)) as x(reference_id text)
    where nullif(trim(reference_id), '') is not null
  )
  select count(*) into v_requested_reference_count from requested_references;

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
      select ii.* from public.inventory_items ii
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
        v_adjustment.item_id, v_current.quantity, abs(v_adjustment.delta);
    end if;

    select * into v_sale
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
    where product_id = v_adjustment.item_id
    order by reference_id
    limit 1;

    v_event_type := case
      when v_adjustment.delta > 0 or coalesce(v_sale.total_amount, 0) < 0 then 'REFUND'
      when coalesce(v_sale.reference_id, '') like '%-res-%'
        or (coalesce(v_sale.total_amount, 0) = 0 and nullif(v_sale.customer_name, '') is not null) then 'RESERVE'
      when v_adjustment.delta < 0 then 'SALE'
      else 'EDIT'
    end;

    perform set_config('gp.inventory_audit_context', jsonb_build_object(
      'source', 'POS',
      'eventType', v_event_type,
      'staffName', coalesce(v_sale.user_id, ''),
      'terminalId', coalesce(v_sale.terminal_id, ''),
      'referenceId', coalesce(v_sale.reference_id, ''),
      'dedupePrefix', coalesce(v_sale.reference_id, 'tx-' || txid_current()::text)
    )::text, true);

    update public.inventory_items
    set quantity = v_new_quantity,
        item = item || jsonb_build_object(
          'quantity', v_new_quantity,
          'lastUpdated', to_char(current_date, 'YYYY-MM-DD')
        ),
        last_updated = current_date,
        updated_at = now()
    where id = v_adjustment.item_id;
  end loop;

  insert into public.sales_log (
    terminal_id, product_id, product_description, quantity, unit_price,
    total_amount, user_id, customer_name, reference_id
  )
  select terminal_id, product_id, product_description, quantity, unit_price,
         total_amount, user_id, customer_name, reference_id
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
  select ii.* from public.inventory_items ii
  where ii.id in (
    select item_id
    from jsonb_to_recordset(coalesce(p_stock_adjustments, '[]'::jsonb)) as x(item_id text, delta integer)
    where item_id is not null
  );
end;
$$;

revoke all on function public.upsert_inventory_item_audited(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.delete_inventory_item_audited(text, jsonb) from public, anon, authenticated;
revoke all on function public.sync_inventory_items_audited(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_inventory_item_audited(jsonb, jsonb) to service_role;
grant execute on function public.delete_inventory_item_audited(text, jsonb) to service_role;
grant execute on function public.sync_inventory_items_audited(jsonb, jsonb, jsonb) to service_role;
grant execute on function public.process_inventory_transaction(jsonb, jsonb) to service_role;
