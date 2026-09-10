# Royal Tyres workbook import

The September 2026 catalogue uses only `Yellow` in `Data` and `RimsData` from
`Reps-Stk_SoH_PriceList.xlsm.xlsx`. Yellow is retained as supplier cost; the existing
Royal selling-price rule adds 15% VAT once and rounds to the nearest Rand.
No other price tier is used, including when Yellow is zero.

Each ItemCode has one listing. Warehouse units come from `RVTRK-Avail`,
`RTCPHX-Avail`, `RTCJHB-Avail`, and `RTC_CT-Avail`, after the spreadsheet's
reservation adjustments. Negative available balances become zero, with their
original values recorded in the reconciliation report. Zero prices retain a
price-confirmation note. The bundled snapshot date is read from the workbook.

The 8 September source contains 1,120 tyre and 49 rim-sheet listings (including
one wheel pressure-sensor accessory). It totals 44,676 available units:
RVTRK 4,071; RTCPHX 29,378; RTCJHB 6,236; RTC_CT 4,991.
43 Yellow prices are zero; two available warehouse balances are negative.
Tubes/flaps and oils/lubricants have no Yellow tier and are excluded.
The historical Cape Town supplement is not merged into this full snapshot.

Prepare using Python with openpyxl (read-only extraction, cached formula values):

```powershell
python scripts/prepare-royal-workbook.py "path/to/Reps-Stk_SoH_PriceList.xlsm.xlsx"
node scripts/publish-supplier-pricing-snapshots.mjs --catalog ROYAL_TYRES --dry-run
npm test
npm run build
```

Review `reports/royal-workbook-import.json`, then publish with the existing
server-only `SUPABASE_SECRET_KEY` environment variable:

```powershell
node scripts/publish-supplier-pricing-snapshots.mjs --catalog ROYAL_TYRES
```

Publishing stages a complete snapshot and activates it atomically through the
existing supplier snapshot function. Old snapshots remain historical, not active
duplicates. Database and bundled parsing share `royalTyresWorkbook.mjs`.
