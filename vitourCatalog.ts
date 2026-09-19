import data from './supplier_data/vitourData.json';
import { ProductType, type TyreProduct } from './types';
import { buildTyreIndexDisplay, parseSupplierTyreFields } from './supplierTyreParsing';
import { parseSupplierTyreImageKeys } from './supplierTyreImageKeys.mjs';

export interface VitourSupplierRow {
  catalogKey: string;
  size: string;
  brand: string;
  pattern: string;
  priceIncludingVat: number | null;
  priceExcludingVat: number | null;
}

export const parseVitourCatalog = (rows: readonly VitourSupplierRow[], importedAt: string): TyreProduct[] => {
  const seen = new Set<string>();
  return rows.map((row) => {
    if (!row.catalogKey || seen.has(row.catalogKey) || !row.size || !row.brand
      || [row.priceIncludingVat, row.priceExcludingVat].some((price) => price !== null && (!Number.isFinite(price) || price <= 0))
      || (row.priceIncludingVat === null) !== (row.priceExcludingVat === null)) {
      throw new Error(`Invalid VITOUR catalogue row: ${row.catalogKey}`);
    }
    seen.add(row.catalogKey);
    const parsed = parseSupplierTyreFields({
      description: `${row.brand} ${row.pattern}`,
      explicitSize: row.size,
      explicitBrand: row.brand,
      explicitPattern: row.pattern,
    });
    const keys = parseSupplierTyreImageKeys(parsed.brand, parsed.pattern);
    return {
      id: `vitour-${row.catalogKey}`,
      type: ProductType.TYRE,
      supplierName: 'VITOUR',
      size: parsed.size,
      brand: parsed.brand,
      pattern: row.pattern ? parsed.pattern : 'Pattern not supplied',
      tyreRating: parsed.rating,
      tyreIndex: parsed.index,
      tyreSpecs: [parsed.specs, !row.pattern ? 'Pattern not supplied' : '', row.priceIncludingVat === null ? 'PRICE ON REQUEST' : ''].filter(Boolean).join(' / '),
      loadSpeedIndex: buildTyreIndexDisplay(parsed.rating, parsed.index),
      imageDesignKey: row.pattern ? keys.designKey : undefined,
      imageFinishKey: keys.finishKey,
      // The price list supplies no quantities or warehouse availability.
      quantity: 0,
      location: 'Stock not supplied - confirm availability',
      costPrice: row.priceExcludingVat ?? 0,
      sellingPrice: row.priceIncludingVat ?? 0,
      supplierCostTaxBasis: 'EXCLUDES_VAT',
      lastUpdated: importedAt,
    };
  });
};

export const loadVitourCatalog = (): TyreProduct[] => parseVitourCatalog(data.rows, data.importedAt);
