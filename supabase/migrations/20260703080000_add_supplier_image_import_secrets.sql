create table if not exists public.app_private_import_secrets (
  name text primary key,
  secret_value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_private_import_secrets enable row level security;

revoke all on table public.app_private_import_secrets from public, anon, authenticated;
grant select, insert, update, delete on table public.app_private_import_secrets to service_role;
