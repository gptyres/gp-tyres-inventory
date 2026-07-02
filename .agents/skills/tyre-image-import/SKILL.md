---
name: tyre-image-import
description: Use for GP Tyres & Mags supplier tyre product-image work: building batches from supplier stock, using browser research to verify exact tyre brand/pattern images, creating review reports, and importing exact matches into Supabase Storage for Enable Visuals.
---

# Tyre Image Import

Use this skill when supplier tyre cards need real product images in the GP Tyres & Mags inventory app.

## Workflow

1. Inspect the current app first:
   - Confirm `supplierStockImages.ts` still uses `supplierName`, `supplierStockCode`, `imageDesignKey`, and `imageFinishKey`.
   - Confirm the bucket is `supplier-stock-images` and table is `public.supplier_stock_images`.
   - Confirm the Edge Function is `import-supplier-stock-image`.

2. Build the next batch:
   - Run `node scripts/tyre-image-import-workflow.mjs --dry-run`.
   - Use filters when useful:
     - `--batch-size 25`
     - `--supplier TYREWAREHOUSE`
     - `--brand DUNLOP`
     - `--resume`
     - `--force`
   - Review `reports/tyre-image-import-review.html`.

3. Verify images with the browser:
   - Prefer official manufacturer product pages first.
   - Use reputable retailer product pages only when official images are unavailable.
   - Exact means brand, pattern/model, and product tyre image all match.
   - Never use wheels, brand logos, vehicle-only photos, banners, or uncertain images.

4. Prepare reviewed source file:
   - Create a JSON file with entries like:

```json
[
  {
    "brand": "Dunlop",
    "pattern": "Grandtrek AT3G",
    "confidence": "exact",
    "imageUrl": "https://example.com/dunlop-at3g.png",
    "sourcePageUrl": "https://example.com/product/dunlop-grandtrek-at3g",
    "checkedSourceUrls": ["https://example.com/product/dunlop-grandtrek-at3g"]
  }
]
```

5. Import exact matches only:
   - Run `node scripts/tyre-image-import-workflow.mjs --sources reports/reviewed-tyre-sources.json --import`.
   - `SUPPLIER_IMAGE_IMPORT_TOKEN` must be set before importing.
   - The script calls the Edge Function so service-role credentials stay server-side.

6. Verify:
   - Run `npm test`.
   - Run `npm run build`.
   - Open the portal, enable visuals, and confirm stored Supabase images appear before manual/generated fallback.

## Rules

- Default to dry-run.
- Do not upload ambiguous or missing matches.
- Do not duplicate images by size or SKU; group by normalized brand and pattern/model.
- The app currently matches images by supplier, so one verified brand/pattern image may create rows for each affected supplier while sharing the same storage object.
- Keep source URLs in reports for audit.
- Do not expose service-role keys in frontend code.
- Do not modify unrelated app behavior.
