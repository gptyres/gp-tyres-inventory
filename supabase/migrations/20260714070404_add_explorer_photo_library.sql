create extension if not exists pgcrypto;

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '8bbf5ea0-b71f-4c2a-a2c0-55ce7316e8c6'::uuid,
  supplier_id uuid,
  product_id text,
  source_record_type text not null,
  source_record_id text not null,
  supplier text,
  product_type text,
  brand text,
  pattern text,
  tyre_size text,
  wheel_size text,
  description text,
  bucket_name text not null,
  storage_path text not null,
  thumbnail_path text,
  public_image_url text,
  original_filename text,
  display_filename text,
  status text not null default 'raw',
  is_customer_ready boolean not null default false,
  is_verified boolean not null default false,
  is_duplicate boolean not null default false,
  active boolean not null default true,
  source_url text,
  source_name text,
  width integer,
  height integer,
  mime_type text,
  file_size bigint,
  tags text[] not null default '{}'::text[],
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_document tsvector generated always as (
    to_tsvector(
      'simple',
      lower(
        coalesce(supplier, '') || ' ' ||
        coalesce(product_type, '') || ' ' ||
        coalesce(brand, '') || ' ' ||
        coalesce(pattern, '') || ' ' ||
        coalesce(tyre_size, '') || ' ' ||
        coalesce(wheel_size, '') || ' ' ||
        coalesce(description, '')
      )
    )
  ) stored,
  constraint photos_source_record_unique unique (source_record_type, source_record_id),
  constraint photos_status_check check (
    status in ('raw', 'review_required', 'approved', 'customer_ready', 'rejected', 'duplicate', 'archived')
  ),
  constraint photos_product_type_check check (
    product_type is null or product_type in ('TYRE', 'WHEEL', 'COILOVER', 'OTHER')
  ),
  constraint photos_bucket_not_empty check (btrim(bucket_name) <> ''),
  constraint photos_storage_path_not_empty check (btrim(storage_path) <> ''),
  constraint photos_image_mime_check check (mime_type is null or mime_type like 'image/%')
);

create index if not exists photos_organization_created_idx
  on public.photos (organization_id, created_at desc, id);
create index if not exists photos_supplier_idx
  on public.photos (organization_id, supplier) where active = true;
create index if not exists photos_product_idx
  on public.photos (organization_id, product_type) where active = true;
create index if not exists photos_tyre_size_idx
  on public.photos (organization_id, tyre_size) where active = true;
create index if not exists photos_wheel_size_idx
  on public.photos (organization_id, wheel_size) where active = true;
create index if not exists photos_brand_pattern_idx
  on public.photos (organization_id, brand, pattern) where active = true;
create index if not exists photos_status_idx
  on public.photos (organization_id, status) where active = true;
create index if not exists photos_customer_ready_idx
  on public.photos (organization_id, is_customer_ready) where active = true;
create index if not exists photos_verified_idx
  on public.photos (organization_id, is_verified) where active = true;
create index if not exists photos_tags_gin_idx
  on public.photos using gin (tags);
create index if not exists photos_search_document_idx
  on public.photos using gin (search_document);

create table if not exists public.photo_activity (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id text not null,
  photo_id uuid references public.photos(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint photo_activity_action_check check (
    action in (
      'photo_viewed',
      'photo_copied',
      'photo_downloaded',
      'photo_shared',
      'photo_marked_customer_ready',
      'photo_status_changed',
      'photo_rejected',
      'batch_download_created'
    )
  )
);

create index if not exists photo_activity_org_created_idx
  on public.photo_activity (organization_id, created_at desc);
create index if not exists photo_activity_photo_idx
  on public.photo_activity (photo_id, created_at desc);

create or replace function public.set_photo_library_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_photo_library_updated_at() from public;

drop trigger if exists set_photos_updated_at on public.photos;
create trigger set_photos_updated_at
before update on public.photos
for each row execute function public.set_photo_library_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tyre-media',
  'tyre-media',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();

alter table public.photos enable row level security;
alter table public.photo_activity enable row level security;

revoke all on table public.photos from anon, authenticated;
revoke all on table public.photo_activity from anon, authenticated;
grant select, insert, update, delete on table public.photos to service_role;
grant select, insert, update, delete on table public.photo_activity to service_role;

insert into public.photos (
  organization_id,
  source_record_type,
  source_record_id,
  supplier,
  product_type,
  brand,
  pattern,
  wheel_size,
  description,
  bucket_name,
  storage_path,
  public_image_url,
  original_filename,
  display_filename,
  status,
  is_customer_ready,
  is_verified,
  active,
  source_url,
  source_name,
  mime_type,
  tags,
  created_at,
  updated_at
)
select
  '8bbf5ea0-b71f-4c2a-a2c0-55ce7316e8c6'::uuid,
  'supplier_stock_image',
  image.id::text,
  image.supplier,
  case
    when image.supplier in ('ALINE', 'TYRE LIFE WHEELS')
      or image.rim_size is not null
      or image.storage_path like 'wheels/%'
      or exists (select 1 from unnest(image.tags) tag where lower(tag) = 'wheel')
    then 'WHEEL'
    else 'TYRE'
  end,
  case
    when image.supplier in ('ALINE', 'TYRE LIFE WHEELS')
      or image.rim_size is not null
      or image.storage_path like 'wheels/%'
    then image.supplier
    else image.finish_key
  end,
  image.design_key,
  image.rim_size,
  concat_ws(' ', image.finish_key, image.design_key, image.rim_size),
  image.storage_bucket,
  image.storage_path,
  image.public_image_url,
  image.file_name,
  image.file_name,
  case
    when exists (select 1 from unnest(image.tags) tag where lower(tag) like '%ambiguous%')
      then 'review_required'
    else 'customer_ready'
  end,
  not exists (select 1 from unnest(image.tags) tag where lower(tag) like '%ambiguous%'),
  not exists (select 1 from unnest(image.tags) tag where lower(tag) like '%ambiguous%'),
  image.active,
  (
    select substring(tag from length('source-page:') + 1)
    from unnest(image.tags) tag
    where tag like 'source-page:%'
    limit 1
  ),
  image.source,
  image.mime_type,
  image.tags,
  image.imported_at,
  coalesce(image.updated_at, image.imported_at)
from public.supplier_stock_images image
where image.active = true
on conflict (source_record_type, source_record_id) do nothing;

insert into public.photos (
  organization_id,
  source_record_type,
  source_record_id,
  supplier,
  product_type,
  brand,
  pattern,
  wheel_size,
  description,
  bucket_name,
  storage_path,
  public_image_url,
  original_filename,
  display_filename,
  status,
  is_customer_ready,
  is_verified,
  active,
  source_url,
  source_name,
  mime_type,
  file_size,
  tags,
  created_at,
  updated_at
)
select
  '8bbf5ea0-b71f-4c2a-a2c0-55ce7316e8c6'::uuid,
  'wheel_catalog_item',
  wheel.id::text,
  'GP TYRES & MAGS',
  'WHEEL',
  wheel.brand,
  coalesce(nullif(wheel.model, ''), nullif(wheel.folder_path, ''), wheel.file_name),
  coalesce(nullif(wheel.wheel_size, ''), nullif(wheel.rim_size, '')),
  concat_ws(' ', wheel.brand, wheel.model, wheel.wheel_size, wheel.pcd, wheel.finish),
  wheel.storage_bucket,
  wheel.storage_path,
  wheel.public_image_url,
  wheel.file_name,
  wheel.file_name,
  case
    when wheel.image_analysis_status = 'completed' and coalesce(wheel.needs_review, false) = false
      then 'customer_ready'
    when coalesce(wheel.needs_review, false) or wheel.image_analysis_status = 'failed'
      then 'review_required'
    else 'raw'
  end,
  wheel.image_analysis_status = 'completed' and coalesce(wheel.needs_review, false) = false,
  wheel.image_analysis_status = 'completed' and coalesce(wheel.needs_review, false) = false,
  wheel.active,
  wheel.drive_url,
  'Wheel Catalogue',
  wheel.mime_type,
  wheel.source_size_bytes,
  wheel.tags || wheel.folder_path_parts,
  wheel.imported_at,
  coalesce(wheel.updated_at, wheel.imported_at)
from public.wheel_catalog_items wheel
where wheel.active = true
on conflict (source_record_type, source_record_id) do nothing;

create or replace function public.sync_supplier_stock_image_photo()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  inferred_product_type text;
  verified boolean;
  extracted_source_url text;
begin
  inferred_product_type := case
    when new.supplier in ('ALINE', 'TYRE LIFE WHEELS')
      or new.rim_size is not null
      or new.storage_path like 'wheels/%'
      or exists (select 1 from unnest(new.tags) tag where lower(tag) = 'wheel')
    then 'WHEEL'
    else 'TYRE'
  end;
  verified := not exists (
    select 1 from unnest(new.tags) tag where lower(tag) like '%ambiguous%'
  );
  select substring(tag from length('source-page:') + 1)
  into extracted_source_url
  from unnest(new.tags) tag
  where tag like 'source-page:%'
  limit 1;

  insert into public.photos (
    organization_id, source_record_type, source_record_id, supplier, product_type,
    brand, pattern, wheel_size, description, bucket_name, storage_path,
    public_image_url, original_filename, display_filename, status,
    is_customer_ready, is_verified, active, source_url, source_name, mime_type,
    tags, created_at, updated_at
  ) values (
    '8bbf5ea0-b71f-4c2a-a2c0-55ce7316e8c6'::uuid,
    'supplier_stock_image', new.id::text, new.supplier, inferred_product_type,
    case when inferred_product_type = 'WHEEL' then new.supplier else new.finish_key end,
    new.design_key, new.rim_size,
    concat_ws(' ', new.finish_key, new.design_key, new.rim_size),
    new.storage_bucket, new.storage_path, new.public_image_url, new.file_name,
    new.file_name, case when verified then 'customer_ready' else 'review_required' end,
    verified, verified, new.active, extracted_source_url, new.source, new.mime_type,
    new.tags, new.imported_at, coalesce(new.updated_at, new.imported_at)
  )
  on conflict (source_record_type, source_record_id) do update set
    supplier = excluded.supplier,
    product_type = excluded.product_type,
    brand = excluded.brand,
    pattern = excluded.pattern,
    wheel_size = excluded.wheel_size,
    description = excluded.description,
    bucket_name = excluded.bucket_name,
    storage_path = excluded.storage_path,
    public_image_url = excluded.public_image_url,
    original_filename = excluded.original_filename,
    display_filename = excluded.display_filename,
    is_verified = excluded.is_verified,
    active = excluded.active,
    source_url = excluded.source_url,
    source_name = excluded.source_name,
    mime_type = excluded.mime_type,
    tags = excluded.tags,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

revoke all on function public.sync_supplier_stock_image_photo() from public;

drop trigger if exists sync_supplier_stock_image_photo on public.supplier_stock_images;
create trigger sync_supplier_stock_image_photo
after insert or update on public.supplier_stock_images
for each row execute function public.sync_supplier_stock_image_photo();

create or replace function public.sync_wheel_catalog_item_photo()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  ready boolean;
  next_status text;
begin
  ready := new.image_analysis_status = 'completed' and coalesce(new.needs_review, false) = false;
  next_status := case
    when ready then 'customer_ready'
    when coalesce(new.needs_review, false) or new.image_analysis_status = 'failed' then 'review_required'
    else 'raw'
  end;

  insert into public.photos (
    organization_id, source_record_type, source_record_id, supplier, product_type,
    brand, pattern, wheel_size, description, bucket_name, storage_path,
    public_image_url, original_filename, display_filename, status,
    is_customer_ready, is_verified, active, source_url, source_name, mime_type,
    file_size, tags, created_at, updated_at
  ) values (
    '8bbf5ea0-b71f-4c2a-a2c0-55ce7316e8c6'::uuid,
    'wheel_catalog_item', new.id::text, 'GP TYRES & MAGS', 'WHEEL', new.brand,
    coalesce(nullif(new.model, ''), nullif(new.folder_path, ''), new.file_name),
    coalesce(nullif(new.wheel_size, ''), nullif(new.rim_size, '')),
    concat_ws(' ', new.brand, new.model, new.wheel_size, new.pcd, new.finish),
    new.storage_bucket, new.storage_path, new.public_image_url, new.file_name,
    new.file_name, next_status, ready, ready, new.active, new.drive_url,
    'Wheel Catalogue', new.mime_type, new.source_size_bytes,
    new.tags || new.folder_path_parts, new.imported_at,
    coalesce(new.updated_at, new.imported_at)
  )
  on conflict (source_record_type, source_record_id) do update set
    brand = excluded.brand,
    pattern = excluded.pattern,
    wheel_size = excluded.wheel_size,
    description = excluded.description,
    bucket_name = excluded.bucket_name,
    storage_path = excluded.storage_path,
    public_image_url = excluded.public_image_url,
    original_filename = excluded.original_filename,
    display_filename = excluded.display_filename,
    status = case
      when public.photos.status in ('approved', 'customer_ready', 'rejected', 'archived')
        then public.photos.status
      else excluded.status
    end,
    is_customer_ready = case
      when public.photos.status in ('approved', 'customer_ready', 'rejected', 'archived')
        then public.photos.is_customer_ready
      else excluded.is_customer_ready
    end,
    is_verified = case
      when public.photos.status in ('approved', 'customer_ready', 'rejected', 'archived')
        then public.photos.is_verified
      else excluded.is_verified
    end,
    active = excluded.active,
    source_url = excluded.source_url,
    mime_type = excluded.mime_type,
    file_size = excluded.file_size,
    tags = excluded.tags,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

revoke all on function public.sync_wheel_catalog_item_photo() from public;

drop trigger if exists sync_wheel_catalog_item_photo on public.wheel_catalog_items;
create trigger sync_wheel_catalog_item_photo
after insert or update on public.wheel_catalog_items
for each row execute function public.sync_wheel_catalog_item_photo();

comment on table public.photos is
  'Explorer-style customer photo library with multi-selection, keyboard shortcuts, clipboard copying, batch download, and mobile file sharing.';
