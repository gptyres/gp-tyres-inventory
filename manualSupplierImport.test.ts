import { describe, expect, it } from 'vitest';
import { normalizeManualSupplierGrid, parseCsvGrid } from './manualSupplierImport';

describe('manual supplier document import', () => {
  it('extracts Safety Grip stock and adds VAT to the supplied price', () => {
    const result = normalizeManualSupplierGrid('SAFETY_GRIP', [
      ['CODE', 'DESCRPTION', 'QUANTITY', 'COST + VAT'],
      ['ANNA0001WS', '155/65R13 ANNAITE AN600', '39', 'R343.00']
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      supplierSku: 'ANNA0001WS',
      brand: 'ANNAITE',
      size: '155/65R13',
      stockUnits: 39,
      costPrice: 394.45,
      sellingPrice: 394.45
    });
  });

  it('extracts Sailun stock from an Excel-style table', () => {
    const result = normalizeManualSupplierGrid('SAILUN', [
      ['SAP Code', 'Brand', 'Pattern', 'Size', 'Stock Qty', 'Nett Price', 'Branch'],
      ['3220002265', 'Sailun', 'ATREZZO SH406', '155/80R13', 27, 502, 'Cape Town']
    ]);

    expect(result.rows[0]).toMatchObject({
      supplierSku: '3220002265',
      brand: 'Sailun',
      productName: 'Sailun ATREZZO SH406',
      stockUnits: 27,
      costPrice: 577.3,
      sellingPrice: 577.3,
      stockLocation: 'Cape Town'
    });
  });

  it('rejects documents without a real stock column', () => {
    expect(() => normalizeManualSupplierGrid('SAILUN', [
      ['SAP Code', 'Size', 'Nett Price'],
      ['3220002265', '155/80R13', 502]
    ])).toThrow(/Quantity\/Stock column/);
  });

  it('parses quoted CSV money values without splitting embedded commas', () => {
    const grid = parseCsvGrid('CODE,DESCRIPTION,QUANTITY,PRICE\r\nA1,155/65R13 TEST TREAD,8,"R1,043.00"');
    expect(grid[1]).toEqual(['A1', '155/65R13 TEST TREAD', '8', 'R1,043.00']);
  });
});
