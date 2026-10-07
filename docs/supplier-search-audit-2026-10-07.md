# All Supplier Stock search audit

Release base: production commit `d566e0e`. No supplier prices, quantities, snapshots or credentials were changed.

## Findings and fixes

- Legacy saved supplier arrays excluded catalogues added after the preference was saved. Migrate once to All; store an explicit All mode so future suppliers are included. Preserve subsequent deliberate custom/empty selections.
- Tyre supplier names and stock codes were absent from the text index. Add them, plus branch keys, across product types. A numeric SKU must not hide a genuine full-size result; preserve accessory SKU lookup.
- Camel-case splitting made uppercase searches miss model names including ContiSportContact, BluEarth and UltimaTour. Normalize case consistently and index punctuation-free aliases per field.
- Exact metric searches omitted LT-prefixed, passenger-prefixed and RF construction variants. Match dimensions while retaining the original displayed specification.
- Commercial sizes now compare numeric width and rim, including decimal rim diameters, without metric conversion or loose-size substitution.
- Numeric fallback previously ignored brand/model filters in partial-size searches. Restrict that fallback to numeric queries.
- Prevent flotation/metric parsing from starting inside decimal dimensions or specification chains.
- Repair size fields with concatenated duplicate text only when a verified description size is their prefix. Preserve specialist motorsport sizes.
- Full model-name searches retain exact supplier-provided models that contain an alternate-size annotation, without treating a size-only query as a conversion request.
- Live pagination continues until an empty page, with a non-advancing cursor guard. Short server-capped pages no longer truncate catalogues.

## Royal Tyres live snapshot verification

Read-only snapshot audit on 7 October 2026, snapshot `bdb4c311-c7e8-4d01-8013-4222a57ae135`:

- 1,192 raw rows, including 1,143 tyre rows.
- Existing branch grouping produces 1,187 listings, including 1,138 tyres.
- `ROYAL TYRES` returns all 1,187 grouped listings.
- `2656018` returns 10 options; `1955015` returns 6 options.
- No failures searching each tyre by supplied size, brand, pattern and recognized canonical metric size.

## Regression coverage

Catalogue-wide bundled-data search coverage; Royal Tyres inclusion in mixed-supplier searches; explicit selection migration; LT, RF, commercial and flotation queries; wrong-size exclusions; brand filtering; SKU lookups; complete live pagination and later-page failures.

`npm test`: 532 tests passed including the read-only live snapshot audit. `npm run build`: passed (existing large-chunk warning remains).

The original working checkout contains archived nested test suites and a historic test asserting the old LT-search failure. Release verification ran from an isolated checkout of the current production revision plus only these search changes.
