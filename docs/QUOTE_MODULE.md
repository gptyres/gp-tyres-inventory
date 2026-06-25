# Quote Module Pricing Processor

## Access

Open **Tools -> Quote Module** in the left sidebar.

## Supported Input

The processor accepts pasted supplier tyre data from product cards, copied tables, labelled pricing blocks, spreadsheet text and compact concatenated rows.

Examples it is designed to handle:

- `R494.00 excl 15% tax (R74.10)`
- `225/45R17 91W FR ContiSportContact 3 MO # 0350928 6 Hours`
- `DUNLOP AT3G WLT265/65/170R2,900.00R3,750.00`

## Pricing Order

For one supplier/base price:

1. Supplier price
2. Add VAT when the record is excluding VAT or VAT state is unknown
3. Apply selected percentage markup
4. Add fixed Rand markup
5. Apply optional R50 rounding

For clear two-price Price From / Price To concatenated rows, the second price is treated as the final customer selling price. Markup and VAT are not added again.

## Rules

- Round R50 can be switched on or off.
- 15%, 20%, 25% and 30% markup buttons are mutually exclusive.
- Fixed Rand markup works independently from percentage markup.
- Category, rating, OEM, stock and lead-time output fields only show when their switches are enabled.

## Session Behaviour

The module stores the current paste, rules, mode, sizes and last result in `sessionStorage`. It survives navigation inside the app during the same browser session. The Clear button removes the stored module session.

## POS Quote PDF

Use **Push to POS** after processing supplier data. The ready customer-facing tyre lines are added to the POS register as editable quote lines, with supplier names removed. The POS module can then generate the branded quote and download it as a PDF.

## Gemini Nano

The deterministic parser works without Gemini Nano. The optional AI provider is present as a progressive enhancement hook for future identification help only. AI is not used to decide prices, stock, lead time or supplier values.

## Known Limits

Unclear records are sent to Review instead of being guessed. Supplier prices should still be checked against the source when the supplier copy format changes significantly.
