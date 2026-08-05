import { describe, expect, it } from 'vitest';
import {
  extractFlotationTyreSizeQuery,
  getNoExactFlotationStockMessage
} from './flotationTyreSizeSearch';
import { searchSupplierInventory } from './supplierInventorySearch';
import { ProductType, type TyreProduct } from './types';
import { searchInventory } from './utils';

const tyre = (id: string, size: string, brand = 'BFGOODRICH'): TyreProduct => ({
  id,
  type: ProductType.TYRE,
  quantity: 4,
  sellingPrice: 2500,
  costPrice: 2000,
  lastUpdated: '2026-08-05',
  brand,
  pattern: 'ALL TERRAIN',
  size,
  loadSpeedIndex: '',
  location: 'SUPPLIER',
  supplierName: 'TEST SUPPLIER'
});

const cases = [
  {
    canonical: '31x10.50R15',
    compact: ['31105015', '3110515'],
    variations: [
      '31x10.50R15', '31X10.50R15', '31×10.50R15', '31x10.5R15', '31X10.5R15',
      '31x10.50x15', '31x10.5x15', '31/10.50/15', '31/10.5/15',
      '31/10.50R15', '31/10.5R15', '31-10.50-15', '31-10.5-15',
      '31 10.50 15', '31 10.5 15', '31105015', '3110515'
    ]
  },
  {
    canonical: '30x9.50R15',
    compact: ['3095015', '309515'],
    variations: [
      '30x9.50R15', '30X9.50R15', '30x9.5R15', '30x9.50x15',
      '30/9.50/15', '30/9.5/15', '30/9.50R15', '30/9.5R15',
      '30-9.50-15', '30 9.50 15', '3095015', '309515'
    ]
  },
  {
    canonical: '37x12.50R15',
    compact: ['37125015', '3712515'],
    variations: [
      '37x12.50R15', '37X12.50R15', '37x12.5R15', '37x12.50x15',
      '37/12.50/15', '37/12.5/15', '37/12.50R15', '37/12.5R15',
      '37-12.50-15', '37 12.50 15', '37125015', '3712515'
    ]
  }
];

describe('flotation tyre size parsing', () => {
  it.each(cases)('normalizes every supported $canonical variation by components', ({ canonical, compact, variations }) => {
    const expected = extractFlotationTyreSizeQuery(canonical);
    expect(expected).not.toBeNull();

    variations.forEach((variation) => {
      const parsed = extractFlotationTyreSizeQuery(variation);
      expect(parsed, variation).toMatchObject({
        diameter: expected?.diameter,
        widthHundredths: expected?.widthHundredths,
        rim: expected?.rim,
        displaySize: canonical
      });
      expect(parsed?.compactKeys).toEqual(compact);
    });
  });

  it('extracts a flotation size without losing the remaining brand query', () => {
    expect(extractFlotationTyreSizeQuery('BFGoodrich 31/10.5/15 KO2')).toMatchObject({
      displaySize: '31x10.50R15',
      remainingQuery: 'BFGoodrich KO2'
    });
  });

  it('does not classify metric tyre sizes as flotation sizes', () => {
    expect(extractFlotationTyreSizeQuery('205/55R16')).toBeNull();
    expect(extractFlotationTyreSizeQuery('2055516')).toBeNull();
  });

  it('supports arbitrary decimal and whole-number widths in explicit and compact forms', () => {
    expect(extractFlotationTyreSizeQuery('34x10.20R16')).toMatchObject({
      widthHundredths: 1020,
      compactKeys: ['34102016', '3410216']
    });
    expect(extractFlotationTyreSizeQuery('3410216')).toMatchObject({
      displaySize: '34x10.20R16'
    });
    expect(extractFlotationTyreSizeQuery('29x7R15')).toMatchObject({
      widthHundredths: 700,
      compactKeys: ['2970015', '29715']
    });
    expect(extractFlotationTyreSizeQuery('29715')).toMatchObject({
      displaySize: '29x7.00R15'
    });
  });
});

describe('strict flotation inventory search', () => {
  const stock = [
    tyre('exact', '31x10.50R15'),
    tyre('wrong-rim', '31x10.50R16'),
    tyre('wrong-width', '31x11.50R15'),
    tyre('wrong-diameter', '30x10.50R15'),
    tyre('wrong-decimal', '31x10.00R15'),
    tyre('wider', '31x12.50R15'),
    tyre('metric-equivalent', '265/75R15')
  ];

  it.each(cases[0].variations)('returns only the exact component match for %s', (query) => {
    expect(searchInventory(stock, query).map((item) => item.id)).toEqual(['exact']);
  });

  it('keeps strict size matching in all-supplier search while ranking a requested brand', () => {
    const supplierStock = [
      tyre('bfg', '31X10.5R15', 'BFGOODRICH'),
      tyre('maxxis', '31/10.50/15', 'MAXXIS'),
      tyre('wrong', '31X10.50R16', 'BFGOODRICH')
    ];

    expect(searchSupplierInventory(supplierStock, '3110515 BFGOODRICH').map((item) => item.id)).toEqual([
      'bfg',
      'maxxis'
    ]);
  });

  it('returns no result and no metric substitute when the components do not match', () => {
    const query = extractFlotationTyreSizeQuery('32x10.50R15');
    expect(query).not.toBeNull();
    expect(searchInventory(stock, '32x10.50R15')).toEqual([]);
    expect(searchSupplierInventory(stock, '32x10.50R15')).toEqual([]);
    expect(query && getNoExactFlotationStockMessage(query)).toBe('No exact stock match found for 32x10.50R15.');
  });
});
