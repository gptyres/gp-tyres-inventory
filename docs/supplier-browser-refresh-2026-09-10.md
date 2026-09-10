# Supplier catalogue refresh — 10 September 2026

Sources were read through the user's authenticated Codex browser. No supplier
orders, carts, enquiries or account settings were changed.

## Verified live replacements

| Catalogue | Products | Coverage |
| --- | ---: | --- |
| Revolution Tyres | 626 | All six tyre categories; CPT, DUR, JHB |
| Treads Unlimited | 2,224 | All 23 pages; regional and national stock |
| TyreWarehouse | 693 | 661 tyres and 32 wheels; JHB, CPT, DUR, GLK |
| Stamford | 790 | 703 tyres and 87 wheels; all three distribution centres |
| Sumitomo/Dunlop | 485 | Tyres across all six displayed warehouses; inbound kept separate |

Published at 10:24–10:25 SAST. Every published field was read back from the active
Supabase snapshot and compared with the normalized source records. All checks
passed. Prior active snapshots were backed up before replacement.

## Data rules

- Dealer cost excluding VAT is retained; VAT-inclusive price is cost × 1.15,
  rounded to the nearest R1. No list or retail price is substituted for an absent
  discounted dealer cost.
- A-Line's current dealer and RRP amounts are already VAT-inclusive four-rim
  totals. The display now recognizes the explicit set-of-four basis marker.
  Legacy per-rim prices are multiplied before rounding, not afterwards.
- Unavailable products remain with zero stock. Unknown prices use the existing
  zero sentinel and are displayed as unavailable, not free. ATT's 698-product
  fallback, including its 108 unavailable entries, is preserved.
- Negative stock allocations are not sellable stock. They are retained in the raw
  source record while availability is floored at zero. Portal caps such as 10+
  and 300+ remain minimums, not exact warehouse totals.
- Missing specifications remain blank. Conflicting A-Line offsets are also left
  blank and recorded for supplier confirmation. Raw descriptions are preserved.
- Inner tubes, flaps and accessories are retained separately for review rather
  than being mislabeled as tyre or wheel products in the current catalogue schema.
- Product-page links are not used as image URLs.

## Reproducibility

Run the scripts from the repository root with Node 24 and the existing dependency
installation. Captures and backups are local artifacts and contain no login
credentials. The private Supabase key is supplied through `SUPABASE_SECRET_KEY`,
never embedded in source or frontend code.

```powershell
node scripts/backup-supplier-refresh.mjs <run-folder>/backup
node scripts/normalize-browser-supplier-refresh.mjs --root <run-folder> --out <run-folder>/normalized
node scripts/prepare-aline-browser-refresh.mjs <run-folder>
node scripts/audit-browser-supplier-refresh.mjs <run-folder>
node scripts/publish-verified-browser-refresh.mjs <run-folder> <CATALOG_KEY>
node scripts/verify-published-browser-refresh.mjs <run-folder> <CATALOG_KEY>
```

Publishing requires the same active snapshot recorded by the backup. The script
refuses to overwrite a newer concurrently published supplier snapshot.

## Remaining verification at this checkpoint

A-Line is prepared but must follow deployment of its set-price display fix.
Tubestone and Safety Grip are still being captured. Exotic's full product list
is captured, but this browser session only exposes Johannesburg stock; Cape Town
must not be zeroed or relabeled as freshly verified. Tread Zone, Exclusive Tyres
New and Bridgestone require fresh user sign-in. APEX's complete unfiltered browser
export and Tyre Life's numeric warehouse quantities remain unverified. File-only
suppliers need new supplier documents before they can receive fresh timestamps.

Validation: 426 application tests pass; production build passes.
