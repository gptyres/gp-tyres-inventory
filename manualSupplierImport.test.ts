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

  it('imports the Bridgestone sheet using its rounded VAT price and portal pattern', () => {
    const result = normalizeManualSupplierGrid('BRIDGESTONE', [
      ['Brand', 'Requested Pattern', 'Portal Pattern', 'Description', 'Size', 'SKU', 'Stock Type', 'Stock Location', 'Stock Units', 'Discounted Price Ex VAT', 'Discounted Price Incl VAT', 'Rounded Incl VAT R25', 'Displayed Price'],
      ['BRIDGESTONE', 'TURANZA 6', 'TURANZA 6', 'HL255/35R19 TURANZA 6 99W MO', '', '835250', 'rep', 'National', 4, 'R 2695.65', 'R3100.00', 'R3100', 'R 4999']
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      supplierSku: '835250',
      brand: 'BRIDGESTONE',
      tyrePattern: 'TURANZA 6',
      size: '255/35R19',
      stockUnits: 4,
      costPrice: 3100,
      sellingPrice: 3100,
      stockLocation: 'National'
    });
  });

  it('imports the APEX inventory workbook layout with Brand & Pattern and Stock Units headers', () => {
    const result = normalizeManualSupplierGrid('APEX', [
      ['Size', 'Brand & Pattern', 'Lead Time', 'Selling Price', 'Stock Units'],
      ['00R12', 'MICHELIN 7. XZR TL 136 A5', '6 Weeks', 'R6050', '3 units'],
      ['205/55R16', 'MICHELIN PRIMACY 4', '7 Days', 'R1450', '20 units']
    ]);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      brand: 'MICHELIN',
      productName: 'MICHELIN XZR 136A5 TL',
      tyrePattern: 'XZR',
      tyreRating: '',
      tyreIndex: '136A5',
      tyreSpecs: 'TL',
      size: '7.00R12',
      stockUnits: 3,
      costPrice: 6957.5,
      sellingPrice: 6957.5,
      stockLocation: 'Apex'
    });
    expect(result.detectedColumns).toEqual(expect.arrayContaining(['description', 'quantity', 'sellingPrice']));
  });

  it('separates the requested tyre size, brand, pattern, rating, index, and specs fields', () => {
    const result = normalizeManualSupplierGrid('APEX', [
      ['Stock Code', 'TYRE_SIZE', 'TYRE_BRAND', 'TYRE_PATTERN', 'TYRE_RATING', 'TYRE_INDEX', 'TYRE_SPECS', 'Stock', 'Cost Inc VAT'],
      ['AP-TRUCK-1', '10.00R20', 'COMPASAL', 'CPS60', '18PR', '149/146K', 'TL', 20, 4500]
    ]);

    expect(result.rows[0]).toMatchObject({
      brand: 'COMPASAL',
      productName: 'COMPASAL CPS60 18PR 149/146K TL',
      tyrePattern: 'CPS60',
      tyreRating: '18PR',
      tyreIndex: '149/146K',
      tyreSpecs: 'TL',
      size: '10.00R20'
    });
  });

  it('repairs split commercial sizes and parses rating and index from Brand & Pattern', () => {
    const result = normalizeManualSupplierGrid('APEX', [
      ['Size', 'Brand & Pattern', 'Selling Price Inc VAT', 'Stock Units'],
      ['00R20', 'COMPASAL 10. CPS60 149/146K 18PR', 4500, 20]
    ]);

    expect(result.rows[0]).toMatchObject({
      brand: 'COMPASAL',
      tyrePattern: 'CPS60',
      tyreRating: '18PR',
      tyreIndex: '149/146K',
      size: '10.00R20'
    });
  });

  it('leaves unavailable tyre fields blank without rejecting an otherwise valid row', () => {
    const result = normalizeManualSupplierGrid('SAFETY_GRIP', [
      ['TYRE_SIZE', 'TYRE_BRAND', 'TYRE_PATTERN', 'TYRE_RATING', 'TYRE_INDEX', 'TYRE_SPECS', 'Stock', 'Cost Inc VAT'],
      ['195/65R15', '', '', '', '', '', 4, 900]
    ]);

    expect(result.rows[0]).toMatchObject({
      size: '195/65R15',
      brand: '',
      tyrePattern: '',
      tyreRating: '',
      tyreIndex: '',
      tyreSpecs: ''
    });
  });

  it('keeps APEX variants that differ only by supplier symbols as separate products', () => {
    const result = normalizeManualSupplierGrid('APEX', [
      ['Size', 'Brand & Pattern', 'Lead Time', 'Selling Price', 'Stock Units'],
      ['165/65R14', 'GENERALTIRE 79T ALTIMAX COMFORT', '7 Days', 'R1100', '1 unit'],
      ['165/65R14', 'GENERALTIRE 79T ALTIMAX COMFORT #', '6 Hours', 'R1050', '20 units']
    ]);

    expect(result.rows).toHaveLength(2);
    expect(new Set(result.rows.map((row) => row.sourceKey)).size).toBe(2);
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

  it('keeps TyreWarehouse discounted cost exact and does not add VAT to a supplied final selling price', () => {
    const result = normalizeManualSupplierGrid('TYREWAREHOUSE', [
      ['Supplier SKU', 'TYRE_SIZE', 'TYRE_BRAND', 'TYRE_PATTERN', 'Stock Location', 'Stock Units', 'Cost Price', 'Cost Price Ex VAT', 'Cost Price Inc VAT', 'Selling Price'],
      ['TW-PORTAL-1', '265/60R18', 'Continental', 'ContiCrossContact AT', 'JHB', 4, 3912.43, 3912.43, 4499.29, 4500]
    ]);

    expect(result.rows[0]).toMatchObject({
      supplierSku: 'TW-PORTAL-1',
      stockLocation: 'JHB',
      costPrice: 3912.43,
      sellingPrice: 4500
    });
  });

  it('calculates a missing TyreWarehouse selling price with VAT once and rounds to the nearest R25', () => {
    const result = normalizeManualSupplierGrid('TYREWAREHOUSE', [
      ['SKU', 'Description', 'Stock', 'Discounted Price Ex VAT', 'Location'],
      ['TW-COST-ONLY', '195/65R15 TEST TREAD', 4, 1100, 'Cape Town']
    ]);

    expect(result.rows[0]).toMatchObject({ costPrice: 1100, sellingPrice: 1275 });
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

  it('imports Tyre Life wheel names, finishes, totals, and VAT-inclusive selling prices', () => {
    const result = normalizeManualSupplierGrid('TYRE_LIFE_WHEELS', [
      ['Size', 'SKU', 'Brand', 'Wheel Name', 'Finish', 'PCD', 'Offset', 'Center Bore', 'Category', 'Selling Price', 'JHB Stock Units', 'CPT Stock Units', 'DBN Stock Units', 'Total Stock Units'],
      ['20” x 9"', 'SAA8306-2983MB', 'Dirty Life', 'A8306 MAYHEM RIDGELINE', 'MACHINED BLACK', '6/139.7', 'ET0', '106.1', 'Wheels', 'R4,850', 2, 3, 3, 8]
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      supplierSku: 'SAA8306-2983MB',
      brand: 'Dirty Life',
      productName: 'Dirty Life A8306 MAYHEM RIDGELINE MACHINED BLACK',
      tyrePattern: 'A8306 MAYHEM RIDGELINE',
      tyreSpecs: 'MACHINED BLACK',
      wheelPcd: '6/139.7',
      wheelOffset: 'ET0',
      wheelCenterBore: '106.1',
      stockByLocation: { JHB: 2, CPT: 3, DBN: 3 },
      size: '20X9',
      stockUnits: 8,
      stockLocation: 'JHB: 2 | CPT: 3 | DBN: 3',
      costPrice: 4850,
      sellingPrice: 4850
    });
  });

  it('keeps Tyre Life wheel catalogue rows whose supplied size is unavailable', () => {
    const result = normalizeManualSupplierGrid('TYRE_LIFE_WHEELS', [
      ['Size', 'SKU', 'Brand', 'Wheel Name', 'Finish', 'Category', 'Selling Price', 'Total Stock Units'],
      ['N/A', 'SAA9303-2983MB12', 'Dirty Life', 'A9303 DT1', 'Matte Black W/Simulated Ring', 'Wheels', 'R6,900', 7],
      ['N/A', 'CBL10893', 'Dynamic', '108.1 - 93.1', 'HUB RINGS', 'Wheels', 'R0', 444]
    ]);

    expect(result.rejectedRows).toBe(0);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      supplierSku: 'SAA9303-2983MB12',
      size: 'N/A',
      sellingPrice: 6900,
      stockUnits: 7
    });
  });

  it('imports Tyre Life tyre stock with its supplied VAT-inclusive selling price', () => {
    const result = normalizeManualSupplierGrid('TYRE_LIFE', [
      ['Size', 'SKU', 'Brand', 'Pattern', 'Load Rating', 'Speed Rating', 'Sidewall', 'Category', 'Selling Price', 'JHB Stock Units', 'CPT Stock Units', 'DBN Stock Units', 'Total Stock Units'],
      ['LT305/55R20', 'PANCCN0164', 'Patriot', 'PATRIOT R/T+', '121/118', 'Q', 'BLK', 'Tyres', 'R5,750', 11, 0, 2, 13]
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      supplierSku: 'PANCCN0164',
      brand: 'Patriot',
      tyrePattern: 'PATRIOT R/T+',
      size: 'LT305/55R20',
      stockUnits: 13,
      costPrice: 5750,
      sellingPrice: 5750
    });
  });
});
