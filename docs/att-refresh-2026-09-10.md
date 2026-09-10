# ATT catalogue refresh — 10 September 2026

Source: authenticated ATT live catalogue, Cape Town warehouse, All Items, all 14 pages. Captured at 07:13 UTC (09:13 SAST).

- 699 unique source entries: 698 inventory products and one excluded training/demo product.
- 590 stocked products, with at least 15,949 units. The portal's 74 `100+` quantities remain conservative minimums of 100, with the original qualifier retained.
- All 108 explicitly unavailable products are retained with stock 0. The portal does not display their cost; zero is the database sentinel for missing pricing, displayed as a dash or “PRICE ON REQUEST”, never a free price.
- Verified stocked costs are ATT's “Your Price (Excl)”. VAT-inclusive pricing applies 15% once and rounds to the nearest R1.
- Supplier SKUs, original descriptions, availability and source timestamps remain in the snapshot. Ambiguous missing specifications are left blank.
- The bundled fallback matches the published catalogue. Other suppliers are unchanged.

## Rebuild and verify

Run `scripts/prepare-att-live-snapshot.mjs` with `--input <raw.json> --output <directory> --expected-rows 699 --previous <previous-snapshot.json> --bundle supplier_data/attSnapshot.ts`. The expected count must come from the completed live capture, not this document on future refreshes.

Run `npm test -- attSnapshot.test.ts components/InventoryView.test.ts liveSupplierCatalog.test.ts supplierCatalogLoader.test.ts` and `npm run build`.

Publish the generated snapshot with `scripts/publish-supplier-snapshot-json.mjs --file <att-snapshot.json> --catalog ATT --supplier ATT --source att-live-browser-2026-09-10` after a successful `--dry-run`. Supply `SUPABASE_SECRET_KEY` through the environment only. The publisher stages all rows before atomic activation and records a supplier sync job; no database schema changes are required.
