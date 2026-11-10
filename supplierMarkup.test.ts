import { describe, expect, it } from 'vitest';
import { formatBulkClipboardText } from './components/InventoryView';
import { liveSupplierRowToInventoryItem } from './liveSupplierCatalog';
import {
  applySupplierMarkup,
  calculateSupplierSellingPrice,
  getSupplierCostExcludingVat,
  getSupplierCostIncludingVat,
  getSupplierCostTaxBasis,
  getSupplierMarkupPriceLabel
} from './supplierMarkup';
import { ProductType, type SupplierCatalog, type TyreProduct } from './types';

const tyre = (overrides: Partial<TyreProduct> = {}): TyreProduct => ({
  id: 'supplier-item',
  type: ProductType.TYRE,
  brand: 'TEST',
  pattern: 'PATTERN',
  size: '205/55R16',
  loadSpeedIndex: '91V',
  location: 'Supplier',
  quantity: 4,
  costPrice: 1000,
  sellingPrice: 1250,
  lastUpdated: '2026-08-05',
  ...overrides
});

describe('supplier markup pricing', () => {
  it.each([
    { catalog: 'ATT', supplier: 'ATT', cost: 437.42, base: 503, percent: 578, fixed: 618 },
    { catalog: 'TREADS_UNLIMITED', supplier: 'Threads Unlimited', cost: 4390, base: 5049, percent: 5806, fixed: 5164 }
  ] as const)('uses the same displayed and copied prices for $catalog in both views', ({
    catalog, supplier, cost, base, percent, fixed
  }) => {
    const live = liveSupplierRowToInventoryItem({
      id: 1, snapshot_id: 'test', catalog_key: catalog, source_key: 'test-item',
      product_type: 'TYRE', supplier, brand: 'AUTOGRIP', product_name: '175/65R14 AUTOGRIP P308 PLUS 82H',
      size: '175/65R14', stock_units: 4, cost_price: cost, selling_price: base,
      source_file: 'test', imported_at: '2026-11-10'
    });
    const combined = { ...live, id: `${supplier}-${live.id}`, supplierName: supplier };
    for (const [adjustment, expected] of [
      [{ mode: 'BASE', value: 0 }, base],
      [{ mode: 'PERCENT', value: 15 }, percent],
      [{ mode: 'FIXED', value: 100 }, fixed]
    ] as const) {
      const [individual] = applySupplierMarkup([live], adjustment, catalog);
      const [all] = applySupplierMarkup([combined], adjustment, 'ALL_SUPPLIERS');
      expect(individual.sellingPrice).toBe(expected);
      expect(all.sellingPrice).toBe(expected);
      expect(formatBulkClipboardText([all])).toBe(formatBulkClipboardText([individual]));
      expect(formatBulkClipboardText([all])).toMatch(new RegExp(`@ R${expected}$`));
    }
  });

  it('keeps current Exclusive Tyres costs VAT-exclusive in all-supplier search after its display rename', () => {
    const item = tyre({ id: 'EXCLUSIVE TYRES-live-exclusive_tyres_new-123', supplierName: 'EXCLUSIVE TYRES' });
    expect(calculateSupplierSellingPrice(item, { mode: 'FIXED', value: 300 }, 'ALL_SUPPLIERS')).toBe(1495);
  });
  it('adds VAT before applying a percentage to ex-VAT supplier cost', () => {
    expect(getSupplierCostIncludingVat(tyre(), 'APEX')).toBeCloseTo(1150);
    expect(calculateSupplierSellingPrice(tyre(), { mode: 'PERCENT', value: 20 }, 'APEX')).toBe(1380);
  });

  it('keeps the HOOSIER TYRES website price VAT-inclusive before markup', () => {
    expect(getSupplierCostTaxBasis(tyre(), 'HOOSIER_TYRES')).toBe('INCLUDES_VAT');
    expect(calculateSupplierSellingPrice(tyre(), { mode: 'FIXED', value: 300 }, 'HOOSIER_TYRES')).toBe(1345);
  });

  it('uses cost plus 15% VAT as the base for percentage and Rand markup', () => {
    expect(getSupplierCostIncludingVat(tyre(), 'REVOLUTION_TYRES')).toBeCloseTo(1150);
    expect(calculateSupplierSellingPrice(tyre(), { mode: 'PERCENT', value: 10 }, 'REVOLUTION_TYRES')).toBe(1265);
    expect(calculateSupplierSellingPrice(tyre(), { mode: 'FIXED', value: 300 }, 'REVOLUTION_TYRES')).toBe(1495);
  });

  it('applies VAT after custom Rand markup for ex-VAT suppliers', () => {
    expect(getSupplierCostIncludingVat(tyre(), 'MAXXIS')).toBeCloseTo(1150);
    expect(calculateSupplierSellingPrice(tyre(), { mode: 'FIXED', value: 300 }, 'MAXXIS')).toBe(1495);
    expect(calculateSupplierSellingPrice(tyre(), { mode: 'PERCENT', value: 20 }, 'MAXXIS')).toBe(1380);
    expect(calculateSupplierSellingPrice(tyre(), { mode: 'FIXED', value: 300 }, 'ROYAL_TYRES')).toBe(1495);
  });

  it('removes included VAT before markup and adds it once to the full subtotal', () => {
    expect(getSupplierCostIncludingVat(tyre(), 'ALINE')).toBe(1000);
    expect(getSupplierCostExcludingVat(tyre(), 'ALINE')).toBeCloseTo(1000 / 1.15);
    expect(calculateSupplierSellingPrice(tyre(), { mode: 'PERCENT', value: 15 }, 'ALINE')).toBe(1150);
    expect(calculateSupplierSellingPrice(tyre(), { mode: 'FIXED', value: 300 }, 'ALINE')).toBe(1345);
  });

  it.each(['TYRE_LIFE', 'TYRE_LIFE_WHEELS', 'ARC', 'DIXON_BATTERIES'] as SupplierCatalog[])(
    'applies VAT only to the markup when bundled %s cost already includes VAT',
    (catalog) => {
      expect(getSupplierCostTaxBasis(tyre(), catalog)).toBe('INCLUDES_VAT');
      expect(calculateSupplierSellingPrice(tyre(), { mode: 'PERCENT', value: 20 }, catalog)).toBe(1200);
      expect(calculateSupplierSellingPrice(tyre(), { mode: 'FIXED', value: 300 }, catalog)).toBe(1345);
    }
  );

  const liveExVatCatalogs: SupplierCatalog[] = [
    'SAILUN',
    'MAXXIS',
    'EXCLUSIVE_TYRES',
    'EXCLUSIVE_TYRES_NEW',
    'TYREWAREHOUSE',
    'ATT',
    'BRIDGESTONE',
    'SAFETY_GRIP',
    'ROYAL_TYRES',
    'REVOLUTION_TYRES',
    'STAMFORD',
    'APEX',
    'TUBESTONE',
    'EXOTIC',
    'TREAD_ZONE',
    'SUMITOMO_DUNLOP',
    'TREADS_UNLIMITED',
    'TYRE_LIFE',
    'TYRE_LIFE_WHEELS'
  ];

  it.each(liveExVatCatalogs)('uses the normalized live ex-VAT cost for %s', (catalog) => {
    const liveItem = tyre({ id: `live-${catalog.toLowerCase()}-item` });
    expect(getSupplierCostTaxBasis(liveItem, catalog)).toBe('EXCLUDES_VAT');
    expect(calculateSupplierSellingPrice(liveItem, { mode: 'PERCENT', value: 20 }, catalog)).toBe(1380);
    expect(calculateSupplierSellingPrice(liveItem, { mode: 'FIXED', value: 300 }, catalog)).toBe(1495);
  });

  it.each(['ALINE', 'NDT', 'WHEEL_TECH'] as SupplierCatalog[])(
    'keeps the live %s listed cost VAT-inclusive before applying markup',
    (catalog) => {
      const liveItem = tyre({ id: `live-${catalog.toLowerCase()}-item` });
      expect(getSupplierCostTaxBasis(liveItem, catalog)).toBe('INCLUDES_VAT');
      expect(calculateSupplierSellingPrice(liveItem, { mode: 'PERCENT', value: 20 }, catalog)).toBe(1200);
      expect(calculateSupplierSellingPrice(liveItem, { mode: 'FIXED', value: 300 }, catalog)).toBe(1345);
    }
  );

  it('resolves VAT treatment per supplier in all-supplier stock', () => {
    expect(calculateSupplierSellingPrice(
      tyre({ id: 'live-sumitomo-item', supplierName: 'SUMITOMO/DUNLOP' }),
      { mode: 'FIXED', value: 250 },
      'ALL_SUPPLIERS'
    )).toBe(1438);
    expect(calculateSupplierSellingPrice(
      tyre({ id: 'live-tyre-life-item', supplierName: 'TYRE LIFE' }),
      { mode: 'FIXED', value: 250 },
      'ALL_SUPPLIERS'
    )).toBe(1438);
    expect(calculateSupplierSellingPrice(
      tyre({ id: 'live-revolution-item', supplierName: 'Revolution Tyres' }),
      { mode: 'FIXED', value: 250 },
      'ALL_SUPPLIERS'
    )).toBe(1438);
    expect(calculateSupplierSellingPrice(
      tyre({ id: 'live-maxxis-item', supplierName: 'MAXXIS' }),
      { mode: 'FIXED', value: 250 },
      'ALL_SUPPLIERS'
    )).toBe(1438);
    expect(calculateSupplierSellingPrice(
      tyre({ id: 'live-royal-item', supplierName: 'Royal Tyres' }),
      { mode: 'FIXED', value: 250 },
      'ALL_SUPPLIERS'
    )).toBe(1438);
  });

  it('does not add VAT to EIBACH cost pricing', () => {
    expect(getSupplierCostTaxBasis(tyre(), 'EIBACH')).toBe('NO_VAT');
    expect(getSupplierCostIncludingVat(tyre(), 'EIBACH')).toBe(1000);
    expect(calculateSupplierSellingPrice(tyre(), { mode: 'PERCENT', value: 25 }, 'EIBACH')).toBe(1250);
    expect(calculateSupplierSellingPrice(tyre(), { mode: 'FIXED', value: 300 }, 'EIBACH')).toBe(1300);
  });

  it('preserves source selling prices in base mode without cloning the list', () => {
    const items = [tyre()];
    expect(applySupplierMarkup(items, { mode: 'BASE', value: 0 }, 'APEX')).toBe(items);
    expect(items[0].sellingPrice).toBe(1250);
  });

  it('sanitizes invalid custom values and labels adjusted prices clearly', () => {
    expect(calculateSupplierSellingPrice(tyre(), { mode: 'FIXED', value: Number.NaN }, 'ALINE')).toBe(1000);
    expect(getSupplierMarkupPriceLabel({ mode: 'PERCENT', value: 25 })).toBe('VAT Inclusive Price (+25%)');
    expect(getSupplierMarkupPriceLabel({ mode: 'FIXED', value: 300 })).toBe('VAT Inclusive Price (+R300)');
  });
});
