alter table public.wheel_catalog_items
  add column if not exists brand text,
  add column if not exists model text,
  add column if not exists pcd_aliases text[] not null default '{}'::text[],
  add column if not exists wheel_size text,
  add column if not exists width text,
  add column if not exists finish text,
  add column if not exists colour text,
  add column if not exists wheel_offset text,
  add column if not exists center_bore text,
  add column if not exists load_rating text,
  add column if not exists vehicle_hints text[] not null default '{}'::text[],
  add column if not exists analysis_confidence numeric(4, 3),
  add column if not exists needs_review boolean not null default false,
  add column if not exists review_reason text,
  add column if not exists image_analysis_model text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'wheel_catalog_items_analysis_confidence_check'
      and conrelid = 'public.wheel_catalog_items'::regclass
  ) then
    alter table public.wheel_catalog_items
      add constraint wheel_catalog_items_analysis_confidence_check
      check (analysis_confidence is null or analysis_confidence between 0 and 1);
  end if;
end
$$;

create index if not exists wheel_catalog_items_pcd_aliases_idx
  on public.wheel_catalog_items using gin (pcd_aliases);

create index if not exists wheel_catalog_items_vehicle_hints_idx
  on public.wheel_catalog_items using gin (vehicle_hints);

create index if not exists wheel_catalog_items_review_idx
  on public.wheel_catalog_items (needs_review, image_analysis_status)
  where active = true;
