# VITOUR price-list import

Source: `VITOUR  JAN 2025.PRICELIST .xlsx`, worksheet `Table 1`, January 2025.
Imported on 19 September 2026. This is a supplied price list, not a live stock feed.

- 553 source rows; 552 unique listings after removing the identical size/description/price duplicate at rows 169 and 553.
- 443 listings have prices; 109 have no price and remain price-on-request.
- Column D is the VAT-inclusive selling price, used directly without further VAT or rounding.
- Column E is the VAT-exclusive cost used by existing supplier markup calculations.
- No quantity or branch-stock column exists. Quantity uses the application's zero sentinel, with an explicit stock-not-supplied location and catalogue note. Do not interpret this as confirmed out of stock.
- Preserve all brands in this supplier's workbook, including the explicitly combined DELMAX / SAFERICH label.
- Row 130 has no pattern; it is labelled "Pattern not supplied" rather than guessing a model.
- Stable internal identifiers are hashes of size and source description; they are not invented supplier SKUs.
- No live portal URL, credentials, image import or online synchronization was supplied or added.

To regenerate from an updated workbook with the same format:

```powershell
node scripts/import-vitour-xlsx.mjs "C:/path/to/price-list.xlsx"
npm test -- vitourCatalog.test.ts components/Sidebar.test.ts
npm run build
```

The importer validates the VAT headings and price pairs, rejects conflicting duplicates, and records the source checksum and row numbers in `supplier_data/vitourData.json`.
