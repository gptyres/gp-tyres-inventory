import { ROYAL_CPT_SEPTEMBER_2026 } from './supplier_data/royalTyresCapeTownSeptember2026.mjs';
import { parseSupplierTyreFields } from './supplierTyreParsing.ts';

const PDF = 'Royal Tyres Cape Town - Price List Sep 2026 Update (1).pdf';
const withStock = (item, stock) => ({
  ...item,
  stock_by_location: stock,
  stock_units: Object.values(stock).reduce((sum, units) => sum + units, 0),
  stock_location: Object.entries(stock).map(([name, units]) => `${name}: ${units}`).join(' | '),
  stock_units_availability: Object.values(stock).some((units) => units > 0) ? 'In stock' : 'Out of stock'
});

/** A branch-only patch: unlisted products, wheels and other warehouses stay intact. */
export function applyRoyalCapeTownUpdate(items, updates = ROYAL_CPT_SEPTEMBER_2026) {
  const result = new Map(items.map((item) => [item.source_key, item]));
  if (result.size !== items.length) throw new Error('Duplicate Royal source keys');
  const seen = new Set();
  for (const update of updates) {
    if (seen.has(update.sourceKey)) throw new Error('Duplicate CPT update');
    seen.add(update.sourceKey);
    if (!Number.isInteger(update.units) || update.units < 0 || !Number.isFinite(update.cost) || update.cost <= 0) {
      throw new Error(`Invalid CPT quantity or price: ${update.sourceKey}`);
    }
    let original = result.get(update.sourceKey);
    if (!original && !update.isNew) throw new Error(`Missing Royal SKU: ${update.sourceKey}`);
    if (original && original.product_type !== 'TYRE') throw new Error('CPT update must not modify wheels');
    if (!original) {
      const fields = parseSupplierTyreFields({ description: `${update.brand} ${update.description}`.replace(/[()]/g, ' '), explicitBrand: update.brand, explicitSize: update.size });
      original = {
        catalog_key: 'ROYAL_TYRES', supplier: 'ROYAL TYRES', supplier_sku: update.supplierSku || null,
        source_key: update.sourceKey, product_type: 'TYRE', product_name: `${update.brand} ${update.description}`,
        brand: update.brand, size: update.size, category: 'PCR',
        tyre_pattern: fields.pattern, tyre_rating: fields.rating, tyre_index: fields.index, tyre_specs: fields.specs,
        cost_price: update.cost, stock_by_location: { CPT: 0 }
      };
    }
    const patch = { cost_price: update.cost, selling_price: Math.round(update.cost * 1.15 + 1e-9),
      supplier_lead_time: null, source_file: PDF,
      source_stock_detail: `CPT only. September 2026 PDF page ${update.page}. Prices exclude VAT. Imported 2026-09-10.` };
    const branchKey = `${original.source_key}::cpt`;
    if (original.cost_price !== update.cost) {
      const { CPT: ignored, ...otherBranches } = original.stock_by_location;
      result.set(original.source_key, withStock(original, otherBranches));
      result.set(branchKey, withStock({ ...original, ...patch, source_key: branchKey }, { CPT: update.units }));
    } else {
      result.delete(branchKey);
      result.set(original.source_key, withStock({ ...original, ...patch }, { ...original.stock_by_location, CPT: update.units }));
    }
  }
  return [...result.values()];
}
