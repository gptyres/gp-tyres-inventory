import { describe, expect, it } from 'vitest';
import { ProductType, type TyreProduct } from './types';
import { searchInventory } from './utils';
import { buildSingleTyreQuery, searchSupplierInventory } from './supplierInventorySearch';
import { parseMetricTyreSize } from './staggeredTyreSearch';
import { extractFlotationTyreSizeQuery } from './flotationTyreSizeSearch';

const tyre = (id: string, size: string, brand = 'ANNAITE'): TyreProduct => ({
  id, type: ProductType.TYRE, size, brand, pattern: 'ALL TERRAIN',
  quantity: 4, sellingPrice: 1500, costPrice: 1200, lastUpdated: '',
  loadSpeedIndex: '', location: 'SUPPLIER', supplierName: 'SAFETY GRIP'
});

describe('LT-independent exact tyre-size search', () => {
  const metric = [
    tyre('prefix', 'LT265/75R16'),
    tyre('spaced-prefix', 'lt 265/75R16'),
    tyre('suffix', '265/75R16LT'),
    tyre('spaced-suffix', '265/75R16 LT'),
    tyre('plain', '265/75R16'),
    tyre('rated', 'LT265/75R16 123/120S'),
    tyre('other-brand', 'LT265/75R16', 'MAXXIS'),
    tyre('wrong-profile', 'LT265/70R16'),
    tyre('wrong-rim', 'LT265/75R17'),
    tyre('wrong-width', 'LT245/75R16')
  ];
  const flotation = [
    tyre('prefix', 'LT31x10.50R15'),
    tyre('spaced-prefix', 'LT 31x10.5R15'),
    tyre('suffix', '31x10.50R15LT'),
    tyre('spaced-suffix', '31x10.5R15 LT'),
    tyre('plain', '31x10.50R15'),
    tyre('other-brand', 'LT31x10.50R15', 'MAXXIS'),
    tyre('wrong-width', 'LT31x12.50R15'),
    tyre('wrong-rim', '31x10.50R16LT'),
    tyre('wrong-diameter', 'LT33x10.50R15')
  ];

  for (const [label, search] of [['owned inventory', searchInventory], ['supplier catalogues', searchSupplierInventory]] as const) {
    it.each(['265/75R16', '265/75/16', '265 75 16', '2657516'])('includes every LT spelling for %s in ' + label, query => {
      expect(search(metric, query).map(p => p.id).sort()).toEqual([
        'other-brand', 'plain', 'prefix', 'rated', 'spaced-prefix', 'spaced-suffix', 'suffix'
      ]);
    });
    it('keeps the brand filter for LT metric tyres in ' + label, () => {
      expect(search(metric, '265/75R16 MAXXIS').map(p => p.id)).toEqual(['other-brand']);
    });
    it.each(['31x10.50R15', '31/10.5/15', '3110515', '31105015'])('includes flotation LT variants for %s in ' + label, query => {
      expect(search(flotation, query).map(p => p.id).sort()).toEqual([
        'other-brand', 'plain', 'prefix', 'spaced-prefix', 'spaced-suffix', 'suffix'
      ]);
    });
    it('keeps the brand filter for LT flotation tyres in ' + label, () => {
      expect(search(flotation, '31x10.5R15 MAXXIS').map(p => p.id)).toEqual(['other-brand']);
    });
    it('finds LT tyres in both requested staggered sizes in ' + label, () => {
      expect(search([tyre('narrow', 'LT265/75R16'), tyre('wide', '285/75R16LT'), tyre('wrong', 'LT285/70R16')],
        '265/75R16 + 285/75R16').map(p => p.id)).toEqual(['narrow', 'wide']);
    });
  }

  it.each(['LT265/75R16', 'LT 265/75R16', '265/75R16LT', '265/75R16 LT', 'LT2657516', '2657516LT'])('accepts optional LT markers in the size input %s', input => {
    expect(parseMetricTyreSize(input)?.display).toBe('265/75R16');
    expect(buildSingleTyreQuery(input, 'ANNAITE').query).toBe('265/75R16 ANNAITE');
  });
  it.each(['LT31x10.50R15', 'LT 31x10.5R15', '31x10.50R15LT', '31x10.5R15 LT', 'LT3110515', '3110515LT'])('accepts optional LT markers in flotation queries %s', input => {
    expect(extractFlotationTyreSizeQuery(input)).toMatchObject({ displaySize: '31x10.50R15', remainingQuery: '' });
    expect(buildSingleTyreQuery(input, 'MAXXIS').query).toBe('31x10.50R15 MAXXIS');
  });
  it('does not mutate the stored LT specification', () => {
    searchSupplierInventory(metric, '265/75R16');
    expect(metric[0].size).toBe('LT265/75R16');
  });
});
