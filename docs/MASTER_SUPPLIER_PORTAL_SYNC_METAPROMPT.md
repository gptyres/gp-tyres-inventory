# GP Tyres Supplier Portal One-Click Sync — Master Metaprompt

Source snapshot reviewed on 13 July 2026.

Copy this entire document into Codex when you want the one-click supplier portal sync implemented or repaired. This is an execution prompt: inspect the real files, make the changes, test them, and report evidence. Do not stop at a design proposal.

---

## BEGIN MASTER PROMPT

You are the senior engineer responsible for the GP Tyres & Mags inventory tracker and its supplier portal automation.

Your task is to implement a secure, admin-triggered, one-click supplier stock synchronization. Add a button beside the existing **Live Supplier Portal** button in the supplier inventory header. One click must sync only the registry supplier whose catalogue the admin is currently viewing, show stock-row progress in near real time to both admin and sales users, publish only validated current-run supplier data, display the last successful sync date/time, and refresh that catalogue without requiring a frontend rebuild.

Do not merely explain how to do this. Inspect the current system, implement the smallest complete production-safe solution, run the relevant tests, and report the exact files changed and verification results.

### 1. Workspaces and source files

The frontend inventory portal is:

    C:\Users\User\Downloads\gp-tyres-&-mags-inventory-tracker (1)

The local supplier automation workspace is:

    C:\Users\User\Documents\GP TYRES SITE

Treat these files as required inputs:

    C:\Users\User\Documents\GP TYRES SITE\supplier_portals.json
    C:\Users\User\Documents\GP TYRES SITE\supplier_credentials_local.csv
    C:\Users\User\Documents\GP TYRES SITE\SUPPLIER_SYNC_AUTOMATION.md
    C:\Users\User\Documents\GP TYRES SITE\SUPPLIER_SYNC_METAPROMPT.md
    C:\Users\User\Documents\GP TYRES SITE\EXOTIC_PORTAL_SYNC_METAPROMPT.md
    C:\Users\User\Documents\GP TYRES SITE\sync_all_suppliers.py

Before editing:

1. Read all repository instructions and inspect both workspaces.
2. Inspect git status and preserve every unrelated user change.
3. Inspect package scripts, Vercel configuration, Supabase migrations/functions, current inventory loading, current admin gating, and the batch runner.
4. Re-read supplier_portals.json at implementation time. It is the source of truth for enabled suppliers, portal URLs, scripts, and credential environment-variable names.
5. Inspect only the credential CSV schema and supplier-name column unless runtime authentication is required. Never display credential values.
6. Fetch the current Supabase changelog and official documentation before implementing Supabase changes. In particular, verify current Auth, RLS, Edge Function, and runtime-limit guidance.

### 2. Existing facts that must be preserved

The frontend is a React/Vite application deployed through Vercel. The existing supplier catalogue header is in App.tsx and currently renders the **Live Supplier Portal** anchor in the SUPPLIER_INVENTORY view.

The supplier catalogues currently load from bundled TypeScript data through supplierCatalogLoader.ts. That static loading path cannot reflect a newly scraped catalogue until a rebuild, so a live snapshot data source and cache invalidation are required.

The supplier automation is a separate local Python/Playwright workspace. Its shared entry point is:

    .\.venv\Scripts\python.exe .\sync_all_suppliers.py

The runner already:

- reads supplier_portals.json;
- loads local credentials from .env and supplier_credentials_local.csv without logging values;
- continues after an individual supplier failure unless explicitly told to stop;
- writes per-run logs and summary files under output\batch_sync\<run-id>;
- rejects stale supplier exports when building the combined import;
- generates gp_tyres_stock_portal_import_<date>.csv from successful current-run outputs.

Do not replace the individual supplier scripts with a new scraper. Reuse the registry and sync_all_suppliers.py.

The existing weekly automation id is:

    gp-tyres-supplier-inventory-batch-sync

Its required schedule is Saturday at 17:00 in the Africa/Johannesburg timezone.

Do not create a duplicate schedule. Preserve or update that automation so the weekly and manual workflows both reach the same shared runner and publishing pipeline.

### 3. Current registered supplier coverage

At the source snapshot date, supplier_portals.json contains these enabled registry entries:

| Registry supplier | Script |
|---|---|
| Exclusive Tyres | inventory_sync.py |
| ATT | att_sync.py |
| Tyrewarehouse | tyrewarehouse_discounted_sync.py |
| Threads Unlimited | threads_unlimited_sync.py |
| Tyre Life | tyrelife_sync.py |
| Tubestone | tubestone_sync.py |
| Aline | aline_sync.py |
| Stamford | stamford_sync.py |
| Tread Zone | treadzone_sync.py |
| Sumitomo/Dunlop | sumitomo_sync.py |
| Apex | apex_sync.py |
| Exotic | exotic_sync.py |

This table is orientation only. Never hardcode it as the runtime registry.

Note these frontend-to-registry differences:

- EXCLUSIVE_TYRES maps to Exclusive Tyres.
- TREADS_UNLIMITED maps to Threads Unlimited despite the spelling difference.
- TYRE_LIFE and TYRE_LIFE_WHEELS are both produced by the single Tyre Life registry job.
- SUMITOMO_DUNLOP maps to Sumitomo/Dunlop.
- SAILUN, SAFETY_GRIP, and ARC currently have bundled catalogues but no matching registry job. A full registry sync must leave their current data untouched and must not claim they were refreshed.

Keep the mapping in one typed module, test it, and reuse it in import/status code. Do not scatter supplier-name aliases across components.

### 4. Non-negotiable architecture

The deployed browser and Vercel frontend cannot directly execute Python/Playwright or read the local C:\Users\User\Documents\GP TYRES SITE directory.

Implement a queue-and-worker design:

    Admin button
      -> authenticated, short-lived server request
      -> private sync job queued in Supabase
      -> local worker claims the job
      -> worker runs sync_all_suppliers.py
      -> worker validates and uploads new catalogue snapshots
      -> active snapshot pointers switch only after validation
      -> portal reloads the new active data

The browser/API request must return quickly after queueing. It must not hold an HTTP request open for the Playwright batch.

Do not run the multi-portal Playwright batch inside a Supabase Edge Function or a Vercel request. These are short-lived orchestration surfaces, not the long-running browser worker.

Do not place supplier credentials in:

- frontend source;
- VITE_ environment variables;
- browser storage;
- API responses;
- Supabase public tables;
- tracked files;
- logs, screenshots, test snapshots, or commits.

Keep supplier usernames/passwords only in the approved local .env or supplier_credentials_local.csv. The local worker may also hold server-only Supabase connection values in its ignored .env. Never expose a service-role or secret key to the client.

### 5. Server-verifiable admin authorization

The React isAdmin boolean and a client-side admin modal are display state, not sufficient API authorization.

The sync button must render only in admin mode, but the queue endpoint must independently verify a server-side admin session or a valid Supabase-authenticated admin identity.

If proper Supabase Auth with server-verifiable admin authorization already exists, reuse it. Authorize from trusted app_metadata or a server-owned role table, never user_metadata.

If proper server-verifiable auth does not exist, add the smallest secure server-side admin-session flow compatible with the current Vercel app:

- validate admin credentials only on the server;
- store hashes or server secrets only in server environment variables;
- issue a short-lived, signed, Secure, HttpOnly, SameSite cookie;
- bind audit information to the selected staff member and terminal;
- rate-limit failed admin authentication and sync requests;
- validate the session again for every create/status request;
- never trust a client-supplied isAdmin flag, staff name, status, command, or file path.

Do not weaken or remove current admin UX while adding server verification.

### 6. Supabase data model and RLS

Create a clean migration using the repository’s normal Supabase migration workflow. Use names consistent with the codebase. The model must cover these responsibilities:

1. A private supplier sync job table with:
   - id;
   - requested scope (`SINGLE_SUPPLIER` for portal clicks, with `ALL_ENABLED` reserved for deliberate scheduled batches);
   - a server-validated target supplier and frontend catalogue key;
   - status: queued, running, succeeded, partial, failed, or cancelled;
   - requested-by audit fields;
   - requested, started, heartbeat, and completed timestamps;
   - worker id;
   - per-supplier redacted results;
   - row counts;
   - safe error summary;
   - run directory and artifact metadata without secrets.
2. A worker heartbeat table so the portal can distinguish online, busy, and offline.
3. A supplier catalogue snapshot table.
4. A supplier catalogue item table keyed to a snapshot, with normalized searchable fields and source metadata.
5. A supplier catalogue source/pointer table whose active_snapshot_id identifies the currently published snapshot for each frontend supplier key.

Use the active snapshot pointer as the publication boundary:

- upload rows into a new staging snapshot;
- validate it completely;
- update one active_snapshot_id pointer only after success;
- keep the old pointer unchanged on scrape, parse, upload, or validation failure;
- retain enough previous snapshots for rollback and clean them up with an explicit retention rule.

Apply RLS to every exposed table.

- The sync jobs and worker heartbeat must not be publicly readable or writable. Access them through authenticated server endpoints or tightly scoped authenticated policies.
- Only the trusted worker/service role may claim jobs, update job state, upload snapshots, and move active pointers.
- Catalogue readers may read only rows reachable through an active snapshot pointer.
- Do not grant broad write access to anon or authenticated.
- If privileged database functions are unavoidable, place them in a non-exposed schema, set a safe search_path, revoke PUBLIC execute, grant only the required server role, and verify with database advisors.

Prevent overlapping runs at the database layer. Only one supplier job may be queued or running at a time. A double-click, refresh, second browser, or API retry must return the existing active job or a 409-style response instead of starting another job.

Job claiming must be atomic. Validate all inputs against fixed allowed values and never turn request text into a shell command.

### 7. Portal API

Use the existing server/API conventions in the repo. Add short-lived endpoints for:

- creating a job for the currently viewed supplier catalogue;
- reading the current/recent job status for that catalogue;
- reading worker availability if it is not included in job status.

The create endpoint must:

1. Require a valid server-verifiable admin session.
2. Accept only a fixed frontend catalogue key and map it server-side through the typed supplier registry mapping; reject script names, paths, commands, credentials, and arbitrary supplier text.
3. Queue scope `SINGLE_SUPPLIER` with the exact mapped registry supplier and catalogue key.
4. enforce the database duplicate-run constraint;
5. record a safe audit event;
6. return 202 with the job id and queued status.

The status endpoint must return only safe operational data: job state, timestamps, supplier names, counts, and redacted failure reasons. It must never return raw logs, environment values, cookies, passwords, command lines containing secrets, or service keys.

### 8. Local worker

Add a maintainable local worker to the supplier automation workspace. It may be Python because the existing runner is Python.

The worker must:

1. Load server-only Supabase values from an ignored local environment file.
2. emit a heartbeat at a documented interval;
3. atomically claim one queued job;
4. set job status to running and maintain a heartbeat while the batch runs;
5. invoke the existing virtual-environment Python executable with an argument array and shell disabled;
6. run `sync_all_suppliers.py --supplier-exact <server-mapped supplier>` for `SINGLE_SUPPLIER`, while retaining no-filter `ALL_ENABLED` support only for the weekly batch;
7. stream machine-readable, credential-safe stock progress events so the job records fetching, validating, and publishing counts;
8. preserve the runner’s continue-on-failure behavior for scheduled batches;
9. capture safe logs while redacting credentials, cookies, authorization headers, tokens, and known secret values;
10. read the exact run’s summary.json rather than guessing from today’s newest file;
11. publish only successful suppliers from this run;
12. update job status from the exact target result;
13. survive a worker restart by detecting and safely recovering or expiring abandoned running jobs;
14. shut down cleanly without corrupting the queue or active snapshots.

Enhance sync_all_suppliers.py only where needed to make the run machine-readable. Prefer adding a run manifest containing:

- run id;
- started/completed timestamps;
- exact summary directory;
- each supplier status;
- exact current-run output files;
- combined portal import path;
- row counts;
- safe error details.

Do not remove its current CLI behavior or human-readable summaries.

Provide documented commands to:

- run one dry readiness check;
- start the worker interactively;
- verify the worker heartbeat;
- configure the existing weekly automation to use the same worker/publisher path.

Do not create an operating-system startup task, new cloud service, or paid resource unless the user explicitly authorizes it. Clearly state that one-click sync requires the local worker machine to be on and the worker to be running.

### 9. Catalogue publishing and frontend loading

Do not import supplier stock into the GP-owned INVENTORY sheet or local on-hand inventory table. Supplier catalogues are read-only external stock and must remain separate.

Use the current-run normalized supplier export as the publishing input. Preserve these fields where available:

- Supplier;
- Supplier SKU;
- Brand;
- Product Name or Pattern;
- Category;
- Size;
- Stock Location;
- Stock Units Availability;
- Stock Units;
- VAT-inclusive Cost Price;
- Selling Price;
- Product URL;
- Source Stock Detail;
- Source File.

Every published row must contain both a non-negative VAT-inclusive cost price and a VAT-inclusive selling price. Prefer an explicit supplier cost including VAT; when a legacy normalized export does not expose cost separately, use its already VAT-inclusive price as the safe cost fallback rather than publishing zero. Never add VAT a second time to a final supplier selling price.

The supplier scripts already apply their approved price/VAT/rounding rules. Do not add VAT or rounding a second time during ingestion. Parse the final selling price and stock units safely for the frontend’s typed InventoryItem model while preserving the original display/source values for audit.

Upload in bounded batches with deterministic keys and idempotency. Validate at least:

- the supplier belongs to the registry result being published;
- the source file was produced by this exact run;
- required headers exist;
- row count is nonzero unless an explicitly documented supplier can validly return zero;
- prices and stock values parse without unsafe coercion;
- duplicate identity rules are deterministic;
- no secret-looking values appear in uploaded fields.

Tyre Life produces both tyre and wheel outputs. One successful Tyre Life job must build and validate separate TYRE_LIFE and TYRE_LIFE_WHEELS snapshots before switching their respective pointers. Do not combine wheels into the tyre catalogue.

Update supplierCatalogLoader.ts so:

- live active snapshots are the preferred data source for registry-backed suppliers;
- bundled TypeScript data remains a safe fallback when no active live snapshot exists;
- SAILUN and SAFETY_GRIP prefer an active manual-upload snapshot and fall back to bundled data until one exists; ARC remains bundled until a live source exists;
- Supabase results are fetched with pagination rather than assuming the default row limit;
- the ALL_SUPPLIERS catalogue composes current active/fallback catalogues correctly;
- an explicit cache invalidation function can clear one catalogue or all catalogues after a job completes;
- a failed refresh never clears a previously working catalogue.

After a successful or partial job, invalidate the affected supplier caches and reload the currently viewed catalogue. Show which suppliers refreshed and which retained their previous snapshot.

### 10. Exact button placement and UX

In App.tsx, find the existing **Live Supplier Portal** anchor inside the blue read-only supplier catalogue banner.

Place the new button in the same right-side action group, immediately beside that anchor. Preserve responsive wrapping on small screens.

Required button behavior:

- Render safe progress, worker state, and the last successful sync date/time whenever currentView is SUPPLIER_INVENTORY, including sales mode. Render the trigger action only in admin mode.
- Label the idle action **Sync _Supplier Name_**.
- One click queues only the registry supplier mapped to the catalogue currently open. Never silently expand a manual portal click to `ALL_ENABLED`.
- Disable it while starting, while its job is active, while another supplier is syncing, or when the worker heartbeat is stale.
- If the local worker heartbeat is stale, do not create a job; show **Sync Worker Offline** with a concise restart instruction.
- During the short claim handoff, show **Starting <supplier>** rather than exposing an internal queued state.
- While running, show the current supplier, stage, stock rows discovered/published, and a percentage when a total is known. Poll safe server status frequently enough to feel live without exposing the private Supabase table.
- On full success, show a success notice with refreshed supplier and row counts.
- On partial success, show a warning listing failed/skipped suppliers with short non-secret reasons and make clear that their older snapshots remain active.
- On failure, show a clear retryable error and keep all old active snapshots.
- Expose a small details panel or modal for per-supplier states and timestamps.
- Keep the most recent successful timestamp and row count visible even when no job is active.
- Keep the Live Supplier Portal link available while no sync is active.
- Use accessible button semantics, keyboard focus, aria-live status updates, and the existing visual system.

Do not expose raw local paths or logs to ordinary users. Admin status may show safe artifact names and run ids.

### 11. Supplier document imports

In admin mode, provide an **Upload Stock File** workflow beside every live supplier catalogue, including SAILUN and SAFETY_GRIP. Accept text PDFs, CSV, XLS, and XLSX files; detect the best stock table or worksheet; require a product identity, size, quantity, and at least one price; preserve branch-specific rows; preview accepted/rejected rows; and add 15% VAT only to detected cost or selling columns that are not explicitly VAT-inclusive.

Publish both VAT-inclusive cost and selling prices. Replace only the selected catalogue's dedicated `SUPPLIER_<CATALOG>` Google Sheet tab, then publish the same validated rows as one atomic live snapshot. Treat ALINE and TYRE_LIFE_WHEELS rows as wheels. Do not activate the portal snapshot when the Sheet write fails. Never persist the uploaded document contents or expose the server-only Sheet token.

### 12. Reliability and security rules

- Never commit .env, .env.local secrets, supplier_credentials_local.csv, cookies, browser profiles, raw diagnostic screenshots, or generated logs.
- Confirm both workspaces ignore local secret files.
- Do not print a secret merely to prove it exists; report ready or missing by environment-variable name.
- Never accept a filesystem path, executable, script name, or shell fragment from the browser.
- Use subprocess argument arrays with shell disabled.
- Redact secrets before persisting any stdout/stderr excerpt.
- Apply timeouts per supplier and heartbeat/stale-job timeouts for the batch.
- A failure in one supplier must not stop the remaining enabled suppliers.
- Never mark stale output as freshly synchronized.
- Never move an active snapshot pointer until its replacement is complete and validated.
- Do not publish an empty or malformed full catalogue over a valid active snapshot.
- Make create-job requests idempotent.
- Audit who requested the sync, when it ran, which worker processed it, and the safe outcome.
- Do not commit, push, deploy, create infrastructure, or modify the existing weekly automation unless the user’s current instruction authorizes that action.

### 13. Required tests and verification

Add focused automated tests for:

1. frontend-to-registry supplier alias mapping;
2. admin-only button visibility and adjacency to Live Supplier Portal;
3. non-admin API rejection;
4. duplicate active-job rejection/idempotency;
5. worker-offline button state;
6. atomic job claim behavior;
7. full-batch continuation after one supplier failure;
8. manifest selection from the exact run;
9. stale-output rejection;
10. Tyre Life tyre/wheel snapshot separation;
11. active pointer unchanged on failed validation;
12. paginated catalogue loading and cache invalidation;
13. secret redaction;
14. successful, partial, and failed UI states.

Run and report:

    npm test
    npm run build

Run the relevant Python tests in the supplier automation virtual environment. Also run:

    .\.venv\Scripts\python.exe .\sync_all_suppliers.py --dry-run

The dry run may report suppliers as missing or ready, but it must not reveal credential values.

If a local Supabase stack is available, verify the migration, RLS, duplicate-run constraint, queue/status endpoints, worker heartbeat, job claim, snapshot upload, pointer switch, and frontend reload end to end. If an external service or unavailable credential blocks live verification, complete every safe local test and report the exact remaining manual step instead of claiming success.

### 14. Definition of done

The task is complete only when all of the following are true:

- An admin-only **Sync _Supplier Name_** button is visibly beside **Live Supplier Portal**.
- The backend independently authorizes the admin; the React isAdmin boolean is not trusted as security.
- One click queues only the supplier catalogue currently open.
- Duplicate clicks cannot create overlapping batches.
- The local worker runs the existing `sync_all_suppliers.py --supplier-exact` path for portal jobs and never receives arbitrary commands.
- Supplier credentials remain local and secret.
- Near-real-time fetching, validating, and publishing stock progress plus final status are visible in the portal.
- Sales mode can see progress and the last successful sync date/time without receiving sync permissions.
- Every live supplier catalogue can be replaced in admin mode from PDF/CSV/XLS/XLSX through its dedicated Google Sheet tab and an atomic live snapshot.
- Every newly published listing has VAT-inclusive cost and selling prices.
- Successful current-run outputs publish through validated snapshots.
- Failed suppliers retain their previous active snapshots.
- The supplier catalogue refreshes without a frontend rebuild.
- Tyre Life tyres and wheels publish to their correct separate catalogues.
- Non-registry catalogues are not falsely marked refreshed.
- Weekly and manual syncs use the same runner/publisher path without a duplicate scheduler.
- Tests and build pass, or any genuine external blocker is documented precisely.

### 15. Final report format

End with a concise report containing:

- implementation status;
- changed files in each workspace;
- migration and endpoint names;
- worker command and heartbeat status;
- button location and behavior;
- supplier statuses and published row counts from any verified run;
- test/build results;
- security checks performed;
- any remaining deployment or machine-startup action requiring user authorization.

Never include passwords, usernames, cookies, access tokens, service keys, raw authorization headers, or unredacted supplier logs in the report.

## END MASTER PROMPT

---

## Verified platform references

- [Supabase Edge Functions overview](https://supabase.com/docs/guides/functions)
- [Securing Supabase Edge Functions](https://supabase.com/docs/guides/functions/auth)
- [Supabase Edge Function runtime limits](https://supabase.com/docs/guides/functions/limits)
- [Supabase changelog](https://supabase.com/changelog)

The queue-and-worker requirement is intentional: the supplier scripts are long-running local Python/Playwright jobs, while hosted request functions are designed for short-lived orchestration.
