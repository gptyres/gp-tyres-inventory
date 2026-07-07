# Wheel Catalog Google Drive Sync

The portal wheel catalog reads from `public.wheel_catalog_items` and serves images from the public Supabase Storage bucket `wheel-catalog-images`.

Current Supabase project: `CODEX_INVENTORY` (`moiybakshvuvppesbnpt`).

The public Google Drive folder is the catalog source of truth:

```text
https://drive.google.com/drive/folders/15MhCztz6IvUXem2okdZkd13zHtdvzCKx
```

## Portal Sync

Admins can open **Products > Wheel Catalogue** and use **Sync Google Drive**.

The browser asks for the wheel catalog sync token/PIN, then calls the secured `sync-wheel-catalog` Supabase Edge Function. The function scans the public Google Drive folder, copies supported images into Supabase Storage, and upserts searchable rows in `wheel_catalog_items`.

The sync runs in batches so the Edge Function stays under Supabase compute limits. Each batch uploads a safe window of images and returns `nextImageOffset`; the portal repeats until `hasMore` is false. Old local-source rows are only deactivated on the final successful batch.

The portal sync:

- skips `_NEEDS_PCD_REVIEW`, `_REPORTS`, `_DUPLICATE_QUARANTINE`, and other underscore-prefixed folders
- uploads images to `wheel-catalog-images`
- upserts searchable rows in `wheel_catalog_items`
- records the run in `wheel_catalog_sync_runs`
- marks old local-source rows inactive after a successful Drive sync so the portal does not show duplicates
- displays the latest sync date/time in the wheel catalog screen

## Google Drive Access

Preferred access is still a Google Drive API key or service account. If neither is configured, the function falls back to Google's public `embeddedfolderview` HTML for public folders, then downloads image files through public Drive download URLs.

Configure a Google API access method when possible:

```powershell
supabase secrets set GOOGLE_DRIVE_API_KEY='your-google-api-key'
```

Alternatively, share the Drive folder with a service account and configure:

```powershell
supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='{"client_email":"...","private_key":"..."}'
```

Verified on 07 Jul 2026:

- Public Drive HTML listing works for `15MhCztz6IvUXem2okdZkd13zHtdvzCKx`.
- Dry-run found `2,036` image files and `3` skipped non-image/system items.
- Initial live upload completed with `2,036` active Google Drive catalog rows.
- Old `local-wheel-catalog-2026-q3-live` rows were deactivated after the Drive import.
- Staff-upload rows remain active separately.

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

Deploy both wheel catalog Edge Functions before using portal sync:

```powershell
supabase functions deploy import-wheel-catalog-local
supabase functions deploy sync-wheel-catalog
supabase secrets set WHEEL_CATALOG_IMPORT_TOKEN='your-token'
```

The local import function accepts `start`, `import`, and `finalize` actions and authenticates with `x-wheel-catalog-import-token`. The Google Drive sync function authenticates with `x-wheel-catalog-sync-token` and can reuse the private `WHEEL_CATALOG_IMPORT_TOKEN` unless `WHEEL_CATALOG_SYNC_TOKEN` is configured separately. Tokens must stay server/admin-side; do not add them as public `VITE_` environment variables.

The deployed `sync-wheel-catalog` function must be deployed with JWT verification disabled because it performs its own `x-wheel-catalog-sync-token` check. Do not make the sync token a public frontend environment variable.

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
