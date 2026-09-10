import { describe, expect, it } from 'vitest';
import { ProductType, type InventoryItem, type TyreProduct } from './types';
import { buildStaggeredTyreQuery, extractStaggeredTyreQuery, parseMetricTyreSize } from './staggeredTyreSearch';
import { searchInventory } from './utils';
import { buildSingleTyreQuery, getSupplierSizeSearchSummary, searchSupplierInventory } from './supplierInventorySearch';

const tyre = (id: string, size: string, brand = 'Michelin', quantity = 4): TyreProduct => ({
  id, size, brand, quantity, type: ProductType.TYRE, pattern: 'Pilot Sport 4', loadSpeedIndex: '',
  costPrice: 100, sellingPrice: 150, lastUpdated: '', location: 'Main'
});
const items: InventoryItem[] = [
  tyre('narrow', '225/40R18'), tyre('wide', '255/35ZR18'),
  tyre('other-brand', '255/35R18', 'Dunlop'), tyre('suffix', '225/40R18 92Y XL'),
  tyre('wrong-rim', '255/35R19'), tyre('wrong-profile', '225/45R18'),
  tyre('unavailable', '255/35R18', 'Michelin', 0),
  { ...tyre('wheel', '225/40R18'), type: ProductType.WHEEL } as unknown as InventoryItem
];

describe('narrow and wide size search', () => {
  it('builds single-size searches with an optional brand or pattern', () => {
    expect(buildSingleTyreQuery('2254018', ' Michelin Pilot Sport 4 ').query).toBe('225/40R18 Michelin Pilot Sport 4');
    expect(buildSingleTyreQuery('22540R18').query).toBe('225/40R18');
    expect(buildSingleTyreQuery('31x10.5R15', 'KO2').query).toBe('31x10.50R15 KO2');
    expect(buildSingleTyreQuery('225').error).toBeTruthy();
    expect(buildSingleTyreQuery('2254018 Michelin').error).toBeTruthy();
    expect(buildSingleTyreQuery('2254018', '2553518').error).toBeTruthy();
    expect(buildSingleTyreQuery('215/75R17.5').query).toBe('215/75R17.5');
  });
  it.each(['225/40R18', '225 40 18', '2254018', '22540R18', '225/40ZR18', '225-40-18', ' 225/40r18 '])('normalizes %s', input => {
    expect(parseMetricTyreSize(input)?.display).toBe('225/40R18');
  });
  it.each(['225', '225/40', 'bad', '225/40R18 extra', '999/99R99', '35x12.50R18'])('rejects incomplete or non-metric field %s', input => {
    expect(parseMetricTyreSize(input)).toBeNull();
  });
  it('validates both inputs and width order without assuming equal rim diameters', () => {
    expect(buildStaggeredTyreQuery('2254018', '2553519', 'Michelin').query).toBe('225/40R18 + 255/35R19 Michelin');
    expect(buildStaggeredTyreQuery('2553518', '2254018').error).toBeTruthy();
    expect(buildStaggeredTyreQuery('2254018', '2253518').error).toBeTruthy();
    expect(buildStaggeredTyreQuery('', '2553518').error).toBeTruthy();
    expect(buildStaggeredTyreQuery('2254018', '2553518', '275/30R18').error).toBeTruthy();
  });
  it.each(['+', '&', 'and', '/', '|', ','])('accepts the %s separator in the main search', separator => {
    expect(extractStaggeredTyreQuery(`Michelin 2553518 ${separator} 2254018`)?.narrow.display).toBe('225/40R18');
  });
  for (const [label, search] of [['own stock', searchInventory], ['supplier stock', searchSupplierInventory]] as const) {
    it(`filters a single exact size by brand and pattern in ${label}`, () => {
      expect(search([tyre('decimal', '215/75R17.5')], '215/75R17')).toEqual([]);
      expect(search(items, '255/35R18 Michelin').map(item => item.id)).toEqual(['wide', 'unavailable']);
      expect(search(items, '2553518 Dunlop Pilot Sport 4').map(item => item.id)).toEqual(['other-brand']);
      expect(search(items, '2553518 missing-brand')).toEqual([]);
      expect(search(items, '2553518 missing-pattern')).toEqual([]);
      expect(search(items, '2553518').map(item => item.id)).toEqual(['wide', 'other-brand', 'unavailable']);
      expect(search(items, '275/35R18 Michelin')).toEqual([]);
    });
    it(`finds both exact sizes in ${label}, excluding other products and near sizes`, () => {
      expect(search(items, '225/40R18 + 255/35R18').map(item => item.id)).toEqual(['narrow', 'wide', 'other-brand', 'suffix', 'unavailable']);
    });
    it(`applies brand filters to both sizes in ${label}`, () => {
      expect(search(items, '2254018 + 2553518 Michelin').map(item => item.id)).toEqual(['narrow', 'wide', 'suffix', 'unavailable']);
    });
    it(`keeps available side visible when the other has no match in ${label}`, () => {
      expect(search(items, '225/40R18 + 275/30R20').map(item => item.id)).toEqual(['narrow', 'suffix']);
      expect(search(items, '205/40R17 + 275/30R20')).toEqual([]);
    });
    it(`returns each item once when the same size is typed twice in ${label}`, () => {
      expect(search(items, '2254018 + 2254018').map(item => item.id)).toEqual(['narrow', 'suffix']);
    });
  }
  it('does not show a misleading single-size supplier summary for a pair', () => {
    expect(getSupplierSizeSearchSummary(items, '2254018 + 2553518')).toBeNull();
    expect(extractStaggeredTyreQuery('2254018 Michelin')).toBeNull();
  });
});
