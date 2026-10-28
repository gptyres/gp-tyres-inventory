import data from './supplier_data/lombardData.json';
import { ProductType, type TyreProduct } from './types';
import { buildTyreIndexDisplay, parseSupplierTyreFields } from './supplierTyreParsing';

export const loadLombardCatalog = (): TyreProduct[] => data.rows.map((row) => {
  const parsed = parseSupplierTyreFields({
    description: `${row.brand} ${row.description.replace(/\[[^\]]*\]/g, '')}`,
    explicitSize: row.size,
    explicitBrand: row.brand,
    explicitPattern: row.pattern,
  });
  return {
    id: `lombard-${row.sku.toLowerCase()}`,
    type: ProductType.TYRE,
    supplierName: 'LOMBARD TYRES',
    supplierStockCode: row.sku,
    size: parsed.size,
    brand: parsed.brand,
    pattern: parsed.pattern,
    tyreRating: parsed.rating,
    tyreIndex: parsed.index,
    tyreSpecs: parsed.specs.replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim(),
    supplierCategory: row.category,
    loadSpeedIndex: buildTyreIndexDisplay(parsed.rating, parsed.index),
    quantity: 0,
    stockQuantityUnknown: true,
    location: 'Stock not supplied - confirm availability',
    costPrice: row.cost,
    sellingPrice: row.price,
    supplierCostTaxBasis: 'EXCLUDES_VAT',
    lastUpdated: data.sourceDate,
  };
});
