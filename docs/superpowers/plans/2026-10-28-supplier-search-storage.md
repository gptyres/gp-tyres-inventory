# Supplier Search and Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Search suppliers from the main stock search, display incremental results faster, and safely reduce Supabase usage.

**Architecture:** Reuse existing supplier search and matching; emit completed supplier batches progressively and mark results incomplete until all finish. Back up retired snapshots and original image objects locally, then perform strictly scoped, independently verified cleanup and image compression.

**Tech Stack:** React, TypeScript, Vitest, Supabase Postgres/Storage, Node.js, bundled Sharp.

**Spec:** docs/superpowers/specs/2026-10-28-supplier-search-storage-design.md

## Global Constraints

- Never include owned inventory in general supplier-search results or alter supplier-specific search scope.
- Keep live supplier snapshots and the two most recent retired snapshots per supplier.
- Back up original database records and images, verify counts and checksums, then mutate only verified targets.
- Preserve product identity, URLs, format, alpha channel and source metadata; skip an image if conversion is unsafe or does not reduce size.
- Never expose credentials; do not rely on paid Supabase image transformations.
- Distinguish partial search results from a completed search; preserve all selected suppliers and existing matching rules.

## Review Focus

- Empty/short search and navigation outside stock search must not force supplier results.
- Rapid query or supplier selection changes must not allow stale asynchronous results to overwrite current results.
- Partial supplier failures must be visible and must not appear as a complete catalogue.
- Real zero stock must remain zero; unknown stock must remain unverified.
- Interrupted backups, concurrent changes, missing objects or mismatched checksums must stop the corresponding destructive operation.

### Task 1: General supplier search

**Files:** App.tsx, components/DashboardView.tsx, stockWorkspace.ts and relevant tests.

- [ ] Write failing routing tests for dashboard and header search, empty query, and supplier-scoped views.
- [ ] Route a submitted general stock query to ALL_SUPPLIERS without changing order, customer or supplier-specific search.
- [ ] Run targeted tests and verify default supplier-only behaviour.

### Task 2: Progressive supplier loading

**Files:** supplierCatalogLoader.ts, App.tsx, supplierCatalogLoader.test.ts and component tests.

- [ ] Write failing tests for ordered partial results, a slower supplier, failure, cancellation and changed selection.
- [ ] Add an optional batch callback to the existing selected-supplier loader and use it only for all-supplier searches.
- [ ] Render partial results with explicit in-progress status and retain complete/error status at the end.
- [ ] Compare one representative authenticated supplier search to the baseline under equivalent browser conditions.

### Task 3: Verified retired-snapshot archive

**Files:** scripts/archive-retired-supplier-snapshots.mjs, associated tests, local backup and manifest under outputs.

- [ ] Test selection of older retired snapshots and preservation of active/latest-two snapshots.
- [ ] Export all selected snapshot metadata, associated job records and all item rows into compressed local files with per-file SHA-256 and row counts.
- [ ] Independently reread each archive and compare snapshot IDs/counts/checksums with the current database; halt on mismatch.
- [ ] Delete only verified eligible retired snapshots through authorized database APIs; verify active pointers/counts and retained snapshots afterward.
- [ ] Report measured database size and note vacuum/reuse limitations.

### Task 4: Image compression and future uploads

**Files:** scripts/optimize-stored-images.mjs, associated tests, image-upload preparation in supplierStockImages.ts / components as appropriate.

- [ ] Test dimension caps, alpha preservation, format preservation, no enlargement, unsafe input and no-savings skips.
- [ ] Produce local verified originals and a manifest before replacing each existing object; preserve its path, MIME type and references.
- [ ] Process a small canary first; verify bytes, dimensions, transparency, product identity and portal display before expanding the batch.
- [ ] Optimize new supported staff uploads before hashing/uploading without changing their identity keys.
- [ ] Report image storage size before/after and any skipped objects.

### Task 5: Release verification

- [ ] Run focused tests, full suite, type checks and production build; inspect the exact diff and preserve unrelated changes.
- [ ] Commit and deploy only the verified changes, then check the live search and visuals.
- [ ] Report database/image storage changes, measured speed, limitations and local backup location.
