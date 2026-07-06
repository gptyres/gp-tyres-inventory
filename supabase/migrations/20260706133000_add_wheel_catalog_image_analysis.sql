alter table public.wheel_catalog_items
  add column if not exists image_ocr_text text,
  add column if not exists image_spec_text text,
  add column if not exists image_analysis_status text not null default 'pending',
  add column if not exists image_analyzed_at timestamptz;

create index if not exists wheel_catalog_items_image_text_search_idx
  on public.wheel_catalog_items
  using gin (
    to_tsvector(
      'simple',
      coalesce(image_ocr_text, '') || ' ' || coalesce(image_spec_text, '')
    )
  )
  where active = true;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'wheel_catalog_items_image_analysis_status_check'
  ) then
    alter table public.wheel_catalog_items
      add constraint wheel_catalog_items_image_analysis_status_check
      check (image_analysis_status in ('pending', 'completed', 'failed'));
  end if;
end $$;
