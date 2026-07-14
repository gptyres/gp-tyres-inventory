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

  it('imports portal supplier cost and selling columns with VAT applied only where needed', () => {
    const result = normalizeManualSupplierGrid('APEX', [
      ['Stock Code', 'Brand', 'Description', 'Size', 'Quantity', 'Cost Price Ex VAT', 'Selling Price Inc VAT', 'Warehouse'],
      ['AP-101', 'Michelin', 'Primacy 4', '205/55R16', 12, 1000, 1450, 'Cape Town']
    ]);

    expect(result.rows[0]).toMatchObject({
      supplierSku: 'AP-101',
      costPrice: 1150,
      sellingPrice: 1450,
      stockLocation: 'Cape Town'
    });
  });

  it('keeps the same SKU as separate stock rows when locations differ', () => {
    const result = normalizeManualSupplierGrid('TYREWAREHOUSE', [
      ['SKU', 'Description', 'Stock', 'Price Inc VAT', 'Location'],
      ['TW-1', '195/65R15 TEST TREAD', 4, 900, 'Cape Town'],
      ['TW-1', '195/65R15 TEST TREAD', 7, 900, 'Johannesburg']
    ]);

    expect(result.rows).toHaveLength(2);
    expect(new Set(result.rows.map((row) => row.sourceKey)).size).toBe(2);
  });

  it('detects semicolon-delimited supplier CSV files', () => {
    const grid = parseCsvGrid('SKU;DESCRIPTION;STOCK;PRICE\nTW-1;195/65R15 TEST;5;900');
    expect(grid[1]).toEqual(['TW-1', '195/65R15 TEST', '5', '900']);
  });

  it('recognizes wheel dimensions for wheel supplier uploads', () => {
    const result = normalizeManualSupplierGrid('ALINE', [
      ['Code', 'Description', 'Size', 'Stock', 'Price Inc VAT'],
      ['AW-17', 'A-Line Vector', '17x8.5', 3, 2200]
    ]);
    expect(result.rows[0]).toMatchObject({ size: '17X8.5', category: 'Wheels' });
  });
});
