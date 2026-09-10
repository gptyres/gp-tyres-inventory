# Tread Zone and Exclusive Tyres New — 10 September 2026

## Tread Zone: published and verified

- Browser source: authenticated Tread Zone catalogue, unfiltered search, 100 rows per page.
- Complete physical-warehouse coverage: 9 pages / 803 SKUs each for CPT, JHB, DUR and PLZ.
- One listing per supplier SKU, with all four exact warehouse quantities retained.
- 735 tyres and 68 existing tube/flap listings retained; tube/flap descriptions remain explicit.
- 755 listings with physical stock and 48 unavailable listings at zero; 97,328 total physical units.
- Incoming Shipments: all 803 SKU rows captured separately and excluded from available stock.
- Supplier Price Excl is preserved as cost. VAT Inclusive Price = round(cost × 1.15), nearest R1.
- Images are supplier catalogue image URLs. Raw names, specifications, stock labels, prices,
  source URLs and capture times are retained in each listing's source evidence.
- Active snapshot: `ce5a8dc7-632c-4f13-9b57-fc8ddfd3e81b`.
- All 803 live database records passed field-by-field comparison to the prepared snapshot.

## Exclusive Tyres New: published and verified

The combined vehicle-type landing page advertises 1,199 products, but the fully paginated
individual categories expose 1,400 distinct SKUs. Larger combined pages repeatedly returned
HTTP 524. All nine category routes were therefore captured with name sorting, 100 per page,
sequential page validation and no duplicate SKUs. All 25 rechecked landing-page products are
included in the category union. The supplier's inconsistent landing-page count was not used
to truncate the catalogue.

| Category | Products | Pages |
| --- | ---: | ---: |
| Passenger car | 753 | 8 |
| Run flat | 113 | 2 |
| SUV | 152 | 2 |
| 4x4 | 227 | 3 |
| Light truck | 89 | 1 |
| Truck/bus | 58 | 1 |
| Speciality | 1 | 1 |
| Agriculture | 0 | 1 explicitly empty |
| Motorcycle | 7 | 1 |

- Exact dealer **My Cost (Excl VAT)** retained. List Price, GP and the portal's suggested
  selling price are not imported. VAT Inclusive Price = round(cost × 1.15), nearest R1.
- 52,628 displayed stock-on-hand units. All 1,400 entries exposed by these category views
  have stock; no unavailable entries were disclosed by these views.
- 756 new SKUs, 11 changed costs and 143 changed quantities among matching older SKUs.
  Eighteen older SKUs are no longer present in the complete category capture; their previous
  positive stock was not carried forward as current stock.
- `F1231HB` (195R15C FIREMAX RADIAL 913 FM) shows 40 units but R0.00 on both the catalogue
  and product page. Zero is the existing application's undisclosed-price sentinel. The UI
  displays a blank/on-request price, and markup logic cannot turn it into a quote.
- Six omitted brand names were verified from labelled product-detail fields. Raw supplier
  names, fields, price exceptions, images, SLA and timestamps remain in source evidence.
- Supplier network label remains **CAPE TOWN**. Category cards do not expose warehouse
  allocations. Only individually verified CPT allocations are recorded; no other regional
  quantities are invented from the network total.
- Active snapshot: `48313eb3-110e-45df-b4a0-c5b3fa9a0cb0`.
- All 1,400 live records passed field-by-field readback. Dataset regression tests also verify
  single-VAT pricing, stock preservation, the on-request exception and card-field formatting.

## Reproduction

The preparation scripts consume browser-captured JSON under a local run directory; they do not
log in, request supplier APIs, create orders or change supplier-account preferences.

1. Back up the two active supplier snapshots with `scripts/backup-supplier-refresh.mjs`.
2. Capture every page through the authenticated Codex browser.
3. Run `scripts/prepare-treadzone-browser-refresh.mjs` and
   `scripts/prepare-exclusive-browser-refresh.mjs` against the run directory.
4. Publish only complete validated catalogues with `scripts/publish-verified-browser-refresh.mjs`.
   Its active-snapshot guard refuses to replace a newer intervening update.
5. Run `scripts/verify-published-browser-refresh.mjs` for field-by-field live readback.
6. Archive verified catalogues with `scripts/archive-verified-supplier-refresh.mjs`.

Credentials, backups and incomplete captures stay local and are not committed. Verified data
archives and their SHA-256 manifest are stored under `supplier_data/snapshots/2026-09-10-tread-exclusive/`.
