# Royal Tyres: Cape Town September 2026

Source: `Royal Tyres Cape Town - Price List Sep 2026 Update (1).pdf`, pages 1-8.
Imported 10 September 2026. The PDF only specifies September, not an exact stock observation date.
All eight tyre pages were rendered and visually checked, including brand logos and table boundaries.
Page 9 contains rims and is intentionally excluded. Unlisted tyres retain their previous CPT stock.

## Reconciliation

- 145 tyre entries, covering 4,937 CPT units.
- 144 matched existing full descriptions (size, model, load/ply and sidewall variants), not fuzzy sizes.
- One new CPT-only entry: ANCHEE 195/60R15 88H AC808, 10 units, cost R499, selling R574.
- Ten existing CPT balances changed. Six Sailun CPT prices differ from the workbook.
- The six price differences use separate CPT rows. Original SKUs, other-branch costs, selling prices,
  specifications and quantities stay unchanged. Each physical unit is counted only once.
- Complete catalogue: 1,176 listings, 44,754 units. CPT 5,069; KZN 29,378; JHB 6,236; RIVER TRUCK 4,071.
- PDF prices exclude VAT: selling price remains `Math.round(cost * 1.15 + 1e-9)`, with no extra markup.
- 49 rim-sheet entries are untouched.

The Prometeon section has Pirelli/Prometeon branding and maps to existing `PIRELLI PROMETEON` descriptions.
Three H108CE rows appear under the RockBuster logo, but match existing ROAD-BUSTER SKUs, models,
  sizes, ply ratings, quantities and prices exactly. Keep their existing ROAD-BUSTER identity;
  do not create duplicate tyres or rename stock in other warehouses. This source-label discrepancy
  remains recorded in `reports/royal-cpt-extracted.json` (`brand` versus `matched_name`).

## Implementation

`royalTyresCapeTownUpdate.mjs` applies the same branch-only update to bundled fallback stock and
the existing server-side snapshot publisher. Stable source keys make reruns idempotent.
No database schema, image matching, stock ownership or other supplier changes are required.
Missing expected identities or invalid units/prices stop the import rather than silently creating duplicates.

Extraction is pinned to this visually reviewed document, with page/section counts and SHA-256 provenance:

```powershell
python scripts/prepare-royal-cpt-pdf.py "path/to/Royal Tyres Cape Town - Price List Sep 2026 Update (1).pdf" --baseline royal-baseline.json
node scripts/publish-supplier-pricing-snapshots.mjs --catalog ROYAL_TYRES --export-items-file royal-updated.json
node scripts/verify-royal-cpt-snapshot.mjs royal-baseline.json
node scripts/publish-supplier-pricing-snapshots.mjs --catalog ROYAL_TYRES
node scripts/verify-royal-cpt-snapshot.mjs royal-updated.json reports/royal-cpt-live-verification.json
```

`royal-baseline.json` is the pre-update workbook export. Verify it against the active database before
publishing. Do not republish stale workbook stock over subsequent live updates. Server publishing requires
`SUPABASE_SECRET_KEY`; no secret is stored in source code or sent to the browser.

When a newer Royal workbook arrives, retire/reconcile this dated overlay before publishing it; do not
apply the September CPT patch blindly over a later stock snapshot.
