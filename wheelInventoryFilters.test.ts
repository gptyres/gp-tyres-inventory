import { describe, expect, it } from 'vitest';
import { ProductType, type WheelProduct, type InventoryItem } from './types';
import { filterWheelInventory, getWheelFilterOptions, parseWheelDimensions, isWheelSearchQuery } from './wheelInventoryFilters';
import { calculateSupplierSellingPrice } from './supplierMarkup';

const wheel = (id: string, fields: Partial<WheelProduct> = {}): WheelProduct => ({
  id, type: ProductType.WHEEL, code: 'SPY', brand: 'A-LINE', size: '15x6.5',
  pcd: '5/112', offset: '35', centerBore: '73.1', colour: 'Gloss Black',
  quantity: 8, sellingPrice: 4500, costPrice: 3900, setQuantity: 4,
  lastUpdated: '2026-10-21', ...fields
});
const stock: InventoryItem[] = [
  wheel('15', { vehicleFitments: 'VW Golf; Audi A3', supplierName: 'A-LINE' }),
  wheel('17', { size: '17x7', code: 'SPY 15', vehicleFitments: 'VW Golf' }),
  wheel('wide', { size: '15x7', pcd: '5x114.3', vehicleFitments: 'Toyota Corolla' }),
  wheel('unknown', { size: '', pcd: '', vehicleFitments: undefined }),
  { id: 'tyre', type: ProductType.TYRE, brand: 'Test', pattern: 'Test', size: '195/65R15', loadSpeedIndex: '', location: '', quantity: 4, costPrice: 500, sellingPrice: 575, lastUpdated: '2026-10-21' }
];

describe('wheel inventory filters', () => {
  it.each(['15', '15 inch', '15 wheels', '15x6.5', '15 black'])('matches exact diameter rather than a code containing the number: %s', query => {
    const ids = filterWheelInventory(stock, query, {}).map(item => item.id);
    expect(ids).toContain('15');
    expect(ids).not.toContain('17');
    expect(ids).not.toContain('tyre');
  });
  it('combines diameter and width without changing prices or stock', () => {
    const result = filterWheelInventory(stock, '', { diameter: '15', width: '6.5' });
    expect(result.map(item => item.id)).toEqual(['15']);
    expect(result[0]).toBe(stock[0]);
  });
  it.each(['5x112', '5/112', '5×112', '5 x 112'])('normalizes complete PCD formats: %s', pcd => {
    expect(filterWheelInventory(stock, '', { pcd }).map(item => item.id)).toEqual(['15', '17']);
  });
  it('does not conflate 5x114 and 5x114.3 or missing PCD', () => {
    expect(filterWheelInventory(stock, '', { pcd: '5x114' })).toEqual([]);
    expect(filterWheelInventory(stock, '5x112', {}).map(item => item.id)).toEqual(['15', '17']);
  });
  it('does not ignore a punctuation-only PCD constraint', () => {
    expect(filterWheelInventory(stock, '', { pcd: '/' })).toEqual([]);
  });
  it('accepts width-first dimension queries without matching other diameters', () => {
    expect(isWheelSearchQuery('6.5Jx15')).toBe(true);
    expect(filterWheelInventory(stock, '6.5Jx15', {}).map(item => item.id)).toEqual(['15']);
  });
  it('leaves absent supplier size metadata blank', () => {
    expect(parseWheelDimensions(undefined as unknown as string)).toEqual({ diameter: '', width: '' });
  });
  it('matches all vehicle terms only against recorded fitment', () => {
    expect(filterWheelInventory(stock, '', { vehicle: 'VW Golf', diameter: '15' }).map(item => item.id)).toEqual(['15']);
    expect(filterWheelInventory(stock, '', { vehicle: 'Toyota Hilux' })).toEqual([]);
  });
  it('requires all search terms and supports public price and exact SKU lookup', () => {
    expect(filterWheelInventory(stock, 'SPY orange', {})).toEqual([]);
    expect(filterWheelInventory(stock, 'SPY R4500', { diameter: '15', width: '6.5' }).map(item => item.id)).toEqual(['15']);
    expect(filterWheelInventory([wheel('sku', { supplierStockCode: '151122' })], '151122', {}).map(item => item.id)).toEqual(['sku']);
    expect(filterWheelInventory(stock, '3900', {})).toEqual([]); // Internal cost is not searchable.
  });
  it('clearing wheel filters restores wheels including unknown specs, not tyres', () => {
    expect(filterWheelInventory(stock, '', {}).map(item => item.id)).toEqual(['15', '17', 'wide', 'unknown']);
  });
  it('searches the displayed marked-up price without changing the source item', () => {
    const getPrice = (item: WheelProduct) => calculateSupplierSellingPrice(item, { mode: 'PERCENT', value: 10 }, 'ALINE');
    expect(getPrice(stock[0] as WheelProduct)).toBe(4290);
    expect(filterWheelInventory(stock, 'R4290', { diameter: '15', width: '6.5' }, getPrice)).toEqual([stock[0]]);
    expect(filterWheelInventory(stock, 'R4500', {}, getPrice)).toEqual([]);
    expect(stock[0].sellingPrice).toBe(4500);
  });
  it.each(['ET20', 'ET 20', 'offset 20'])('keeps labelled offsets separate from wheel diameter: %s', query => {
    const candidates = [wheel('offset20', { size: '17x8', offset: '20' }), wheel('negative', { size: '20x8', offset: '-20' })];
    expect(filterWheelInventory(candidates, query, {}).map(item => item.id)).toEqual(['offset20']);
    expect(filterWheelInventory(candidates, '20', {}).map(item => item.id)).toEqual(['negative']);
    expect(filterWheelInventory(candidates, 'ET -20', {}).map(item => item.id)).toEqual(['negative']);
  });
  it('retains punctuation-free aliases for wheel names and stock codes', () => {
    expect(filterWheelInventory([wheel('alias', { code: 'RF-02', supplierStockCode: 'AL-1234' })], 'RF02 AL1234', {}).map(item => item.id)).toEqual(['alias']);
  });
  it('builds numeric options only from recorded wheel specs', () => {
    expect(getWheelFilterOptions(stock)).toEqual({ diameters: ['15', '17'], widths: ['6.5', '7'] });
  });
  it.each([
    ['15X6.5J', { diameter: '15', width: '6.5' }],
    ['6.5Jx15', { diameter: '15', width: '6.5' }],
    ['17 inch', { diameter: '17', width: '' }],
    ['', { diameter: '', width: '' }]
  ])('parses dimensions without guessing from other fields: %s', (size, expected) => {
    expect(parseWheelDimensions(size as string)).toEqual(expected);
  });
  it('detects wheel intent without hijacking tyre size searches', () => {
    expect(isWheelSearchQuery('15 inch')).toBe(true);
    expect(isWheelSearchQuery('5x112')).toBe(true);
    expect(isWheelSearchQuery('15x6.5')).toBe(true);
    expect(isWheelSearchQuery('195/65R15')).toBe(false);
    expect(isWheelSearchQuery('31x10.5R15')).toBe(false);
    expect(isWheelSearchQuery('2656018')).toBe(false);
  });
});
