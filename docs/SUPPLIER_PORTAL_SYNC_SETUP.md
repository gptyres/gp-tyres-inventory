# Supplier Portal One-Click Sync Setup

The portal implementation was deployed to production on 13 July 2026. The Supabase schema, production-only Vercel secrets, local worker, Windows login task, and existing Saturday automation are configured.

## Architecture

The admin button sends the supplier catalogue currently open in the portal to the Vercel API. The API maps that fixed catalogue key to one registry supplier and creates one private `SINGLE_SUPPLIER` Supabase job. A worker running in the local supplier automation folder claims that job, runs `sync_all_suppliers.py --supplier-exact <mapped supplier>`, validates the exact-run output, uploads its catalogue snapshot, and switches only that supplier's active catalogue pointer.

For portal-button syncs, the worker keeps the exact supplier cost before VAT, applies 15% VAT once, and rounds only the final selling price to the nearest R25. Each supplier scraper has an explicit ex-VAT or VAT-inclusive price mapping so an already VAT-inclusive portal value is first converted back to its source cost instead of receiving VAT a second time.

Tyrewarehouse uses the authenticated portal's displayed `product_price` as its discounted ex-VAT dealer cost. The API's separate `up_min` value is not used for catalogue pricing.

Supplier usernames and passwords never leave:

    C:\Users\User\Documents\GP TYRES SITE\.env
    C:\Users\User\Documents\GP TYRES SITE\supplier_credentials_local.csv

## 1. Apply the database migration

Apply:

    supabase\migrations\20260713074309_supplier_portal_sync.sql
    supabase\migrations\20260713075806_add_supplier_sync_fk_index.sql
    supabase\migrations\20260713090519_single_supplier_sync_progress.sql
    supabase\migrations\20260713103732_add_manual_supplier_upload_scope.sql
    supabase\migrations\20260713104643_extend_manual_supplier_target.sql
    supabase\migrations\20260713105347_add_vat_inclusive_supplier_cost_price.sql

Use the normal linked Supabase deployment workflow for this project. Run database advisors after applying it.

The migration creates:

- supplier_sync_jobs
- supplier_sync_workers
- supplier_catalog_snapshots
- supplier_catalog_items
- supplier_catalog_sources
- claim_supplier_sync_job
- recover_stale_supplier_sync_jobs
- activate_supplier_catalog_snapshots

Job and worker data is service-role only. Public catalogue reads are limited by RLS to the current active snapshot.

## 2. Configure Vercel server values

The production Vercel project must contain these server-only environment values:

    SUPABASE_URL
    GP_ADMIN_PASSWORD_SHA256
    GP_ADMIN_SESSION_SECRET

Also set one of:

    SUPABASE_SECRET_KEY
    SUPABASE_SERVICE_ROLE_KEY

Do not prefix them with VITE_.

Generate the password hash without printing or storing the password in source:

    $password = Read-Host -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
    try {
      $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
      $bytes = [Text.Encoding]::UTF8.GetBytes($plain)
      ([Security.Cryptography.SHA256]::Create().ComputeHash($bytes) | ForEach-Object ToString x2) -join ''
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }

Use a cryptographically random value of at least 32 characters for GP_ADMIN_SESSION_SECRET.

All five values are configured for Production on `team-gp-tyres/gp-tyres-inventory`. For local Vercel development, put the same blank-key structure in .env.local. That file is ignored by Git.

## 3. Configure the local worker

The production worker reads `SUPABASE_SECRET_KEY` from the Windows user-level environment and receives `SUPABASE_URL` at process startup. A local ignored `.env` may be used for development:

    SUPABASE_URL=
    SUPABASE_SECRET_KEY=
    SUPABASE_SERVICE_ROLE_KEY=

Do not add them to supplier_portals.json or the frontend.

Check the worker without processing a batch:

    cd "C:\Users\User\Documents\GP TYRES SITE"
    .\.venv\Scripts\python.exe .\supplier_sync_worker.py --once

Start the persistent worker:

    .\.venv\Scripts\python.exe .\supplier_sync_worker.py

Production also registers the Windows task `GP Tyres Supplier Sync Worker`. It launches the same command in a hidden window at user login and uses `IgnoreNew` instance handling. The currently running worker id is `gp-tyres-office-worker`.

The button shows **Sync Worker Offline** when its heartbeat is older than 45 seconds. While a job is active, the worker streams safe stock-row counts into the private job record; the portal polls them every 1.5 seconds and displays the current stage, row count, and percentage when a total is known. Sales mode receives the same safe progress and last-successful-sync timestamp but cannot trigger a sync.

## 4. Weekly automation

Keep the existing automation id:

    gp-tyres-supplier-inventory-batch-sync

Its schedule remains Saturday at 17:00 Africa/Johannesburg.

The existing automation is configured to run:

    cd "C:\Users\User\Documents\GP TYRES SITE"
    .\.venv\Scripts\python.exe .\supplier_sync_worker.py --enqueue --once

This queues and processes a SYSTEM job through the same runner and snapshot publisher used by the portal button. Do not create a second schedule.

## 5. Admin workflow

1. Enter admin mode.
2. Open Supplier Inventory.
3. Confirm **Sync _Supplier Name_** appears beside **Live Supplier Portal**.
4. Click it once.
5. Confirm the status reads **Worker online**. The Windows login task keeps it running after a restart.
6. Watch the live progress bar move through fetching, validating, and publishing stock rows.
7. Expand **Last sync** for the result.

The button queues only the supplier catalogue currently open. It never expands a manual click into `ALL_ENABLED`. Only one queued or running job is allowed at a time, and a failed supplier keeps its previous active catalogue snapshot. The weekly automation remains a deliberate full-registry batch because it has no current portal context.

## 6. Supplier document upload workflow

In admin mode, open any live supplier catalogue and choose **Upload Stock File**. Upload a text PDF, CSV, XLS, or XLSX document, confirm the extracted preview, and publish it. The importer detects likely identity, size, stock, location, cost, and selling columns, including a stock table on a later Excel worksheet. The server first replaces that catalogue's dedicated `SUPPLIER_<CATALOG>` Google Sheet tab and only then activates the matching live portal snapshot.

Both cost and selling prices are stored VAT-inclusive. If either uploaded price header is not explicitly VAT-inclusive, the importer adds 15% VAT once to that column. The file contents are processed in the browser and are not retained by the server.

## 7. Safe verification

Run:

    npm test
    npm run build

In the supplier automation folder run:

    .\.venv\Scripts\python.exe -m pytest -q
    .\.venv\Scripts\python.exe .\sync_all_suppliers.py --supplier-exact Apex --dry-run

The readiness check reports only READY or missing environment-variable names. It must never print credential values.
