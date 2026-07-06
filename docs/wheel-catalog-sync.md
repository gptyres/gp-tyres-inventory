# Wheel Catalog Local Sync

The portal wheel catalog reads from `public.wheel_catalog_items` and serves images from the public Supabase Storage bucket `wheel-catalog-images`.

Current Supabase project: `CODEX_INVENTORY` (`moiybakshvuvppesbnpt`).

The local Desktop folder is the source of truth:

```text
C:\Users\User\Desktop\WHEEL CATALOG 2026 Q3_LIVE
```

## Portal Sync

Admins can open **Products > Wheel Catalogue** and use **Sync Local Folder**.

The browser will ask for the wheel catalog sync token/PIN, then ask the admin to select the local `WHEEL CATALOG 2026 Q3_LIVE` folder. A hosted Vercel website cannot silently read a Desktop folder, so the folder picker is required.

The portal sync:

- skips `_NEEDS_PCD_REVIEW` and other underscore-prefixed folders
- uploads images to `wheel-catalog-images`
- upserts searchable rows in `wheel_catalog_items`
- records the run in `wheel_catalog_sync_runs`
- finalizes the run by marking missing local rows inactive
- displays the latest sync date/time in the wheel catalog screen

## Command-Line Backup

The same import flow can be run from this project folder:

```powershell
$env:WHEEL_CATALOG_IMPORT_TOKEN='your-token'
npm run wheel:import
```

The command defaults to:

```text
C:\Users\User\Desktop\WHEEL CATALOG 2026 Q3_LIVE
```

## Supabase Function

Deploy the local import Edge Function before using portal sync:

```powershell
supabase functions deploy import-wheel-catalog-local
supabase secrets set WHEEL_CATALOG_IMPORT_TOKEN='your-token'
```

The function accepts `start`, `import`, and `finalize` actions and authenticates with `x-wheel-catalog-import-token`. The token must stay server/admin-side; do not add it as a public `VITE_` environment variable.
