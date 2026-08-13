import { describe, expect, it } from 'vitest';
import {
  canonicalizeSheetInventoryRows,
  getStaleSheetInventoryIds,
  parseSheetCurrency,
  parseSheetInventoryRow,
  parseSheetInventoryRows,
  resolveSheetInventoryPortalIds
} from './sheetInventorySync';
import { ProductType, TyreProduct } from './types';

describe('sheet inventory sync parser', () => {
  it('parses a live INVENTORY tyre row into portal stock shape', () => {
    const parsed = parseSheetInventoryRow({
      rowNumber: 4,
      values: ['DECK', '', 'FRONWAY', '155/12C', 8, 'R529.00', 'R899.00'],
      portalId: 't-3'
    });

    expect('item' in parsed).toBe(true);
    if (!('item' in parsed)) return;

    expect(parsed.item).toMatchObject({
      id: 't-3',
      type: ProductType.TYRE,
      location: 'DECK',
      brand: 'FRONWAY',
      pattern: 'Standard',
      size: '155/12C',
      quantity: 8,
      costPrice: 529,
      sellingPrice: 899
    });
  });

  it('parses currency formats used in the sheet', () => {
    expect(parseSheetCurrency('R1,450.00')).toBe(1450);
    expect(parseSheetCurrency('R1950,00')).toBe(1950);
    expect(parseSheetCurrency(899)).toBe(899);
    expect(parseSheetCurrency('to be booked for credit')).toBe(0);
  });

  it('skips headers, blanks and section rows without crashing', () => {
    const result = parseSheetInventoryRows([
      { rowNumber: 1, values: ['LOCATIO', '', 'PRODUCT NAME', 'DESCRIPTION', 'QUANTITY', 'COST', 'SELLING'] },
      { rowNumber: 1400, values: ['NANKANG SEMI SLICKS'] },
      { rowNumber: 1401, values: [] },
      { rowNumber: 1402, values: ['BACK OF STORE', '', 'NANKANG AR1 SEMI SLICKS', '235/40/18', 2, 1725, 2999] }
    ]);

    expect(result.parsed).toHaveLength(1);
    expect(result.skipped).toHaveLength(3);
    expect(result.parsed[0].item.brand).toBe('NANKANG');
  });

  it('uses column B as a fallback product name for older sheet rows', () => {
    const parsed = parseSheetInventoryRow({
      rowNumber: 176,
      values: ['BACK OF STORE', 'RADAR WSW 35MM', '', '195/14C', 1, 1025, 1599]
    });

    expect('item' in parsed).toBe(true);
    if (!('item' in parsed)) return;

    expect(parsed.item.brand).toBe('RADAR');
    expect(parsed.item.pattern).toBe('WSW 35MM');
    expect(parsed.item.size).toBe('195/14C');
  });

  it('matches parsed rows back to existing portal ids where possible', () => {
    const parsedResult = parseSheetInventoryRows([
      { rowNumber: 10, values: ['HOME', '', 'TRACMAX TX5', '155/80/13', 12, 450, 799] },
      { rowNumber: 11, values: ['DECK', '', 'DURUN HD918', '155/70/13', 3, 465, 799] }
    ]);

    const existingItems: TyreProduct[] = [
      {
        id: 't-10',
        type: ProductType.TYRE,
        location: 'HOME',
        brand: 'TRACMAX',
        pattern: 'TX5',
        size: '155/80/13',
        quantity: 10,
        costPrice: 450,
        sellingPrice: 799,
        loadSpeedIndex: '',
        lastUpdated: '2026-07-04'
      },
      {
        id: 't-7',
        type: ProductType.TYRE,
        location: 'DECK',
        brand: 'DURUN',
        pattern: 'HD918',
        size: '155/70/13',
        quantity: 4,
        costPrice: 465,
        sellingPrice: 799,
        loadSpeedIndex: '',
        lastUpdated: '2026-07-04'
      }
    ];

    const matches = resolveSheetInventoryPortalIds(parsedResult.parsed, existingItems);
    expect(matches.get(10)).toBe('t-10');
    expect(matches.get(11)).toBe('t-7');
  });

  it('reuses the portal id for the same Google Sheet row when its product changes', () => {
    const parsedResult = parseSheetInventoryRows([
      { rowNumber: 10, values: ['HOME', '', 'DUNLOP AT3G', '265/65R17', 4, 1800, 2600] }
    ]);
    const existingItems: TyreProduct[] = [{
      id: 't-10',
      type: ProductType.TYRE,
      location: 'HOME',
      brand: 'TRACMAX',
      pattern: 'TX5',
      size: '155/80R13',
      quantity: 10,
      costPrice: 450,
      sellingPrice: 799,
      loadSpeedIndex: '',
      lastUpdated: '2026-07-04',
      sheetRowNumber: 10,
      sheetSyncedAt: '2026-08-12T10:00:00.000Z'
    }];

    const matches = resolveSheetInventoryPortalIds(parsedResult.parsed, existingItems);
    expect(matches.get(10)).toBe('t-10');
  });

  it('collapses duplicate sheet identities and prefers a row with a valid portal id', () => {
    const parsedResult = parseSheetInventoryRows([
      { rowNumber: 10, values: ['HOME', '', 'TRACMAX TX5', '155/80R13', 10, 450, 799] },
      { rowNumber: 12, values: ['HOME', '', 'TRACMAX TX5', '155/80R13', 12, 450, 799], portalId: 't-12' }
    ]);
    const existingItems: TyreProduct[] = [{
      id: 't-12',
      type: ProductType.TYRE,
      location: 'HOME',
      brand: 'TRACMAX',
      pattern: 'TX5',
      size: '155/80R13',
      quantity: 10,
      costPrice: 450,
      sellingPrice: 799,
      loadSpeedIndex: '',
      lastUpdated: '2026-07-04',
      sheetRowNumber: 12,
      sheetSyncedAt: '2026-08-12T10:00:00.000Z'
    }];

    const result = canonicalizeSheetInventoryRows(parsedResult.parsed, existingItems);
    expect(result.canonical).toHaveLength(1);
    expect(result.canonical[0].rowNumber).toBe(12);
    expect(result.duplicates.map((row) => row.rowNumber)).toEqual([10]);
  });

  it('retires only stale sheet-managed tyres during a full reconciliation', () => {
    const existingItems: TyreProduct[] = [
      {
        id: 'active', type: ProductType.TYRE, location: 'HOME', brand: 'A', pattern: 'ONE', size: '1',
        quantity: 1, costPrice: 1, sellingPrice: 1, loadSpeedIndex: '', lastUpdated: '2026-08-12',
        sheetSyncedAt: '2026-08-12T10:00:00.000Z'
      },
      {
        id: 'stale', type: ProductType.TYRE, location: 'HOME', brand: 'B', pattern: 'TWO', size: '2',
        quantity: 1, costPrice: 1, sellingPrice: 1, loadSpeedIndex: '', lastUpdated: '2026-08-12',
        sheetSyncedAt: '2026-08-11T10:00:00.000Z'
      },
      {
        id: 'manual', type: ProductType.TYRE, location: 'HOME', brand: 'C', pattern: 'THREE', size: '3',
        quantity: 1, costPrice: 1, sellingPrice: 1, loadSpeedIndex: '', lastUpdated: '2026-08-12'
      }
    ];

    expect(getStaleSheetInventoryIds(existingItems, ['active'])).toEqual(['stale']);
  });
});
