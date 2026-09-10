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
| A-Line | 703 | All 15 pages; wheels, four-rim pricing and available warehouse stock |
| Tubestone | 2,146 | All 122 pages; five warehouses; 10+ availability retained as a minimum |

These seven live snapshots contain 7,667 products. Every published field was read back from the active
Supabase snapshot and compared with the normalized source records. All checks
passed. Prior active snapshots were backed up before replacement.

## Complete bundled catalogue refreshes

| Catalogue | Products | Verified stock |
| --- | ---: | --- |
| Hoosier | 64 tyres | 43 available, 21 preorder, 169 units; all six shop pages and 66 detail pages checked; two tubes retained separately |
| Eibach | 325 | 151 available, 174 unavailable, 216 units; all 181 discovered category/pagination pages and every product page checked |

Eibach includes two current products missing from its vehicle-category navigation.
Four unavailable Eibach products have no published price; no price was invented.
The nine complete refreshed catalogues contain 8,056 products in total.

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
- Hoosier retains its website VAT-inclusive amounts. Eibach retains the existing
  explicitly configured website-cost + 25%, nearest-R50 policy; this refresh does
  not silently replace that supplier-specific rule.
- The shared inventory card, list, sheet, location and copy views now retain the
  `+` indicator for portal-capped quantities instead of presenting them as exact.

## Reproducibility

Run the scripts from the repository root with Node 24 and the existing dependency
installation. Captures and backups are local artifacts and contain no login
credentials. The private Supabase key is supplied through `SUPABASE_SECRET_KEY`,
never embedded in source or frontend code.

```powershell
node scripts/backup-supplier-refresh.mjs <run-folder>/backup
node scripts/normalize-browser-supplier-refresh.mjs --root <run-folder> --out <run-folder>/normalized
node scripts/prepare-aline-browser-refresh.mjs <run-folder>
node scripts/prepare-hoosier-browser-refresh.mjs <run-folder>
node scripts/prepare-eibach-browser-refresh.mjs <run-folder>
node scripts/audit-browser-supplier-refresh.mjs <run-folder>
node scripts/publish-verified-browser-refresh.mjs <run-folder> <CATALOG_KEY>
node scripts/verify-published-browser-refresh.mjs <run-folder> <CATALOG_KEY>
```

Publishing requires the same active snapshot recorded by the backup, or this
run's own last verified publishing receipt for an in-run correction. The script
refuses to overwrite a newer concurrently published supplier snapshot.

The seven verified database snapshots are committed as compressed JSON under
`supplier_data/snapshots/2026-09-10/`, with product counts, active snapshot IDs,
capture times and SHA-256 checksums in `manifest.json`. Hoosier and Eibach are
committed as their normal application catalogue modules.

## Coverage limits — not all suppliers were freshly updated

| Catalogue | Status and required next step |
| --- | --- |
| ATT | Earlier same-day complete 698-product catalogue retained, including 108 unavailable entries; not rescraped in this run |
| APEX | Browser search caps results at 50; a complete unfiltered export could not be verified. Prior 1,838-product snapshot retained |
| Exotic | All 1,337 product pages/listings captured for JHB; CPT quantities not available in this session. Prior complete catalogue retained instead of zeroing CPT |
| Safety Grip | All 416 virtual-feed entries captured. Warehouse selector did not change displayed quantities; VAT basis and warehouse scope require confirmation before replacement |
| Tyre Life tyres and wheels | Current catalogue accessible (477 tyres, 199 wheels); numeric warehouse quantities absent. No guessed quantities published |
| Tread Zone | Fresh user sign-in required after login failed |
| Exclusive Tyres New | Fresh user sign-in required; portal reports incorrect login/temporary disablement. No repeated password attempts |
| Bridgestone | User sign-in/OTP required |
| Royal Tyres, Sailun, Maxxis, Dixon Batteries, ARC | Fresh supplier documents required; existing file-based catalogues left unchanged |
| NDT, Wheel Tech | No verified current dealer-price and quantity source obtained; existing catalogues left unchanged |

Unchanged or incomplete suppliers have not been given fresh sync timestamps.
The retired Exclusive Tyres legacy catalogue remains retired. Live verification
includes database field-by-field readback and automated application tests; the
production browser currently shows the login screen, so an authenticated visual
inspection of the new cards is not claimed.

Validation: all 428 application tests and the production build pass. The final
release also incorporates the concurrently published V5.0.3 Sales cost-visibility
change, preserving the newer live release rather than reverting it.
