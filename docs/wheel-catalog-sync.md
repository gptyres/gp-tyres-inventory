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

## Image Text Analysis

Visible text on catalog images can be indexed for live search with:

```powershell
$env:GEMINI_API_KEY='your-gemini-key'
node scripts/analyze-wheel-catalog-images.mjs
```

The analysis script reads active wheel catalog rows, sends each image to Gemini for visible wheel text/spec extraction, then updates the row through the secured `import-wheel-catalog-local` Edge Function using the private wheel import token.

Rows with `image_analysis_status = completed` are skipped, so reruns continue from the remaining pending images. Gemini free-tier limits are usually too low for the full catalog in one day; if quota is reached, the script stops safely and leaves the rest pending. Rerun after quota resets, or use a paid/project quota and optionally tune:

```powershell
$env:WHEEL_CATALOG_ANALYSIS_CONCURRENCY='2'
$env:WHEEL_CATALOG_ANALYSIS_DELAY_MS='12000'
node scripts/analyze-wheel-catalog-images.mjs
```
