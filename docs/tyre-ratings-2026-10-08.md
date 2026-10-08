# Supplier tyre load and speed ratings

Cards display the supplied load index and speed symbol independently of the Specs toggle. Single, selected and bulk clipboard text includes the combined service description before the selling price. Different ratings are not collapsed by bulk-copy deduplication.

## Verified recovery

On 2026-10-08, 14,351 active branch-stock rows received a missing `tyre_index`. Only that field was updated. Existing indices, prices, quantities, snapshots and stock timestamps were preserved.

Evidence came from current stored supplier product metadata and authenticated fresh portal captures for Tyre Life, Stamford and TyreWarehouse. Fresh captures were matched by supplier, SKU, size, brand and pattern, never size alone. Missing or conflicting evidence is not guessed.

| Catalogue | Branch rows recovered |
| --- | ---: |
| Bridgestone | 171 |
| TyreWarehouse | 2336 |
| Tread Zone | 48 |
| Tyre Life | 1158 |
| Stamford | 1302 |
| Sumitomo/Dunlop | 37 |
| Apex | 36 |
| Treads Unlimited | 8774 |
| ATT | 397 |
| Revolution Tyres | 78 |
| Exotic | 12 |
| Royal Tyres | 2 |

These counts are branch rows, not unique products. Some suppliers do not disclose ratings in their available feeds; those cards say "Load/speed rating not supplied".

## Repeatable maintenance

- `scripts/fetch-supplier-rating-evidence.py` uses the existing office portal adapters and credential loaders to capture only product identity and rating evidence for Stamford or TyreWarehouse.
- `scripts/backfill-tyre-service-descriptions.mjs` audits active snapshots by default. Explicit `--apply` updates only missing indices, checks the active snapshot and verifies each write. Requires the server-side `SUPABASE_SECRET_KEY` environment variable; never put this credential in frontend configuration.
- `--tyrelife-evidence` accepts the existing Tyre Life CSV export. Repeatable `--portal-evidence` accepts fresh captures. `--out` records the detailed local audit, including affected row IDs and evidence source.
- Raw captures and row-level audits remain outside Git in `.codex_tmp`.
- `scripts/office-supplier-rating-fields.patch` records the matching changes applied to the separately maintained office automation adapters: preserve Stamford Load Index/Speed Index and TyreWarehouse product specifications in future exports.

Recovery is independent of full stock synchronization and does not claim a fresh stock refresh for every supplier.
