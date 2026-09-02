import { describe, expect, it } from 'vitest';
import {
  buildInventoryReportRows,
  createInventoryReport,
  getInventoryReportColumns,
  getInventoryReportFileName,
  isInventoryReportUnavailable,
  mapInventoryItemToReportRow,
  sanitizeInventoryReportFileSegment,
  type InventoryReportContext
} from './inventoryReport';
import {
  BatteryProduct,
  CoiloverProduct,
  ProductType,
  TyreProduct,
  WheelProduct
} from './types';

const tyre: TyreProduct = {
  id: 'apex-alnac',
  type: ProductType.TYRE,
  quantity: 12,
  sellingPrice: 1475,
  costPrice: 1000,
  lastUpdated: '2026-08-13',
  supplierName: 'APEX',
  supplierLeadTime: '6 Hours',
  stockByLocation: { CPT: 7, JHB: 5, DBN: 0 },
  brand: 'APOLLO',
  pattern: '195/50R15 APOLLO ALNAC 4G TYRE',
  size: '195/50R15',
  loadSpeedIndex: '82V',
  tyreRating: '',
  tyreIndex: '82V',
  tyreSpecs: 'TL',
  location: 'CPT: 7 | JHB: 5 | DBN: 0'
};

const wheel: WheelProduct = {
  id: 'aline-dazzle',
  type: ProductType.WHEEL,
  quantity: 4,
  sellingPrice: 3750,
  costPrice: 3000,
  lastUpdated: '2026-08-13',
  supplierName: 'ALINE',
  code: 'DAZZLE',
  brand: 'ALINE',
  finish: 'GLOSS BLACK',
  size: '15X6.5',
  pcd: '4/100',
  offset: '35',
  centerBore: '67.1',
  colour: 'ALINE | GLOSS BLACK',
  setQuantity: 1,
  location: 'CPT: 4'
};

const coilover: CoiloverProduct = {
  id: 'arc-golf-7',
  type: ProductType.COILOVER,
  quantity: 2,
  sellingPrice: 7500,
  costPrice: 6000,
  lastUpdated: '2026-08-13',
  supplierName: 'ARC',
  brand: 'ARC',
  series: 'YELLOW',
  vehicleCompatibility: 'VW GOLF 7'
};

const eibachKit: CoiloverProduct = {
  ...coilover,
  id: 'eibach-3648',
  brand: 'EIBACH',
  series: 'PRO-KIT',
  vehicleCompatibility: 'BMW 7 Series E38 730i, 735i, 740i',
  vehicleBrand: 'BMW',
  vehicleModel: '7 Series E38',
  frontLowering: '30mm',
  rearLowering: '30mm',
  stockStatus: '1 in stock',
  location: 'Eibach SA',
  stockByLocation: { 'Eibach SA': 1 },
  supplierName: 'EIBACH',
  supplierStockCode: '2049-140',
  quantity: 1,
  costPrice: 9655,
  sellingPrice: 12050
};

const battery: BatteryProduct = {
  id: 'dixon-646',
  type: ProductType.BATTERY,
  quantity: 3,
  sellingPrice: 1850,
  costPrice: 1400,
  lastUpdated: '2026-08-13',
  supplierName: 'DIXON BATTERIES',
  batteryType: '646',
  batteryDescription: '12V HEAVY DUTY',
  nettPrice: 1300,
  grossPrice: 1850,
  costIncluding: 1400
};

const reportContext = (overrides: Partial<InventoryReportContext> = {}): InventoryReportContext => ({
  catalogueLabel: 'APEX Catalog',
  searchQuery: '195/50R15 Apollo',
  generatedAt: '2026-08-13T12:00:00.000Z',
  resultCount: 1,
  showSupplierName: false,
  visibility: {
    visual: false,
    type: true,
    mainSpec: true,
    brandModel: true,
    supplier: false,
    specs: true,
    location: true,
    quantity: true,
    cost: false,
    sellingPrice: true
  },
  ...overrides
});

describe('inventory report row mapping', () => {
  it('cleans duplicated tyre size and brand while preserving the final displayed price', () => {
    const row = mapInventoryItemToReportRow(tyre, { imageUrls: { [tyre.id]: 'https://example.com/alnac.jpg' } });
    expect(row.mainSpec).toBe('195/50R15');
    expect(row.brandModel).toBe('APOLLO / ALNAC 4G');
    expect(row.details).toContain('82V');
    expect(row.location).toBe('JHB: 5 | CPT: 7');
    expect(row.sellingPrice).toBe(1475);
    expect(row.imageUrl).toBe('https://example.com/alnac.jpg');
  });

  it('maps wheel specifications, coilover fitment, and battery type', () => {
    const wheelRow = mapInventoryItemToReportRow(wheel);
    expect(wheelRow.brandModel).toBe('ALINE / DAZZLE');
    expect(wheelRow.details).toContain('PCD 4/100');
    expect(wheelRow.details).toContain('ET 35');
    expect(wheelRow.details).toContain('CB 67.1');

    const coiloverRow = mapInventoryItemToReportRow(coilover);
    expect(coiloverRow.mainSpec).toBe('VW GOLF 7');
    expect(coiloverRow.brandModel).toBe('ARC / YELLOW');

    const eibachRow = mapInventoryItemToReportRow(eibachKit);
    expect(eibachRow.type).toBe('Lowering Kit');
    expect(eibachRow.details).toContain('Front 30mm');
    expect(eibachRow.details).toContain('SKU 2049-140');
    expect(eibachRow.location).toBe('Eibach SA: 1');

    const batteryRow = mapInventoryItemToReportRow(battery);
    expect(batteryRow.mainSpec).toBe('646');
    expect(batteryRow.brandModel).toBe('12V HEAVY DUTY');
  });

  it('keeps supplier identity in a dedicated Supplier field for all-supplier reports', () => {
    const row = mapInventoryItemToReportRow(tyre, { showSupplierName: true });
    expect(row.supplier).toBe('APEX');
    expect(row.details).not.toContain('APEX');
  });

  it('maps every supplied filtered row without applying a render chunk limit', () => {
    const filteredRows = Array.from({ length: 145 }, (_, index) => ({ ...tyre, id: `tyre-${index}` }));
    expect(buildInventoryReportRows(filteredRows)).toHaveLength(145);
  });

  it('keeps zero-stock rows in the report and marks them unavailable for the PDF renderer', () => {
    const outOfStockRow = mapInventoryItemToReportRow({ ...tyre, quantity: 0 });
    expect(outOfStockRow.quantity).toBe(0);
    expect(isInventoryReportUnavailable(outOfStockRow)).toBe(true);
    expect(isInventoryReportUnavailable(mapInventoryItemToReportRow(tyre))).toBe(false);
  });

  it('includes an explicit supplier preorder status in report details', () => {
    const preorderRow = mapInventoryItemToReportRow({
      ...tyre,
      supplierName: 'HOOSIER TYRES',
      supplierOrderStatus: 'PREORDER',
      quantity: 0
    });
    expect(preorderRow.details).toContain('Order status: PREORDER');
  });

  it('adds deterministic group labels without changing row order', () => {
    const rows = buildInventoryReportRows([wheel, tyre], { groupBy: 'type' });
    expect(rows.map((row) => [row.id, row.groupLabel])).toEqual([
      ['aline-dazzle', 'WHEEL'],
      ['apex-alnac', 'TYRE']
    ]);
  });
});

describe('inventory report visibility and filenames', () => {
  it('only exposes Cost when the authorized UI context enables it', () => {
    expect(getInventoryReportColumns(reportContext()).map((column) => column.key)).not.toContain('costPrice');
    expect(getInventoryReportColumns(reportContext({
      visibility: { ...reportContext().visibility, cost: true }
    })).map((column) => column.key)).toContain('costPrice');
  });

  it('removes the Details column when no exported row has meaningful details', () => {
    const rowWithoutDetails = { ...mapInventoryItemToReportRow(battery), details: '-' };
    expect(getInventoryReportColumns(reportContext(), [rowWithoutDetails]).map((column) => column.key)).not.toContain('details');

    const rowWithDetails = { ...rowWithoutDetails, details: 'Heavy duty terminals' };
    expect(getInventoryReportColumns(reportContext(), [rowWithDetails]).map((column) => column.key)).toContain('details');
  });

  it('adds the clean Supplier column only for all-supplier report context', () => {
    const rows = [mapInventoryItemToReportRow(tyre)];
    const supplierContext = reportContext({
      showSupplierName: true,
      visibility: { ...reportContext().visibility, supplier: true }
    });
    expect(getInventoryReportColumns(supplierContext, rows).map((column) => column.key)).toContain('supplier');
    expect(getInventoryReportColumns(supplierContext, rows).map((column) => column.key)).toEqual([
      'type', 'supplier', 'mainSpec', 'brandModel', 'details', 'location', 'quantity', 'sellingPrice'
    ]);
    expect(getInventoryReportColumns(reportContext(), rows).map((column) => column.key)).not.toContain('supplier');
  });

  it('keeps Details compact using the shortest meaningful detail in the result set', () => {
    const rows = [
      { ...mapInventoryItemToReportRow(tyre), details: '82V' },
      { ...mapInventoryItemToReportRow(wheel), details: 'GLOSS BLACK | PCD 4/100 | ET 35 | CB 67.1' }
    ];
    const detailsColumn = getInventoryReportColumns(reportContext(), rows).find((column) => column.key === 'details');
    expect(detailsColumn?.weight).toBe(0.65);
  });

  it('uses the active catalogue and search in a filesystem-safe filename', () => {
    expect(sanitizeInventoryReportFileSegment('Tyre Life / Wheels')).toBe('tyre-life-wheels');
    expect(getInventoryReportFileName(reportContext())).toBe('gp-tyres-inventory-apex-catalog-195-50r15-apollo-2026-08-13.pdf');
  });
});

describe('inventory report pagination', () => {
  it('creates repeated table headers across multiple landscape A4 pages without dropping rows', async () => {
    const rows = buildInventoryReportRows(Array.from({ length: 90 }, (_, index) => ({
      ...tyre,
      id: `page-row-${index}`,
      pattern: `ALNAC 4G PRODUCT VARIANT ${index}`
    })));
    const result = await createInventoryReport({
      rows,
      context: reportContext({ resultCount: rows.length, searchQuery: '' }),
      logoUrl: ''
    });
    expect(result.rowCount).toBe(90);
    expect(result.pageCount).toBeGreaterThan(1);
    expect(result.headerCount).toBe(result.pageCount);
  });

  it('uses a placeholder when a requested visual is unavailable', async () => {
    const context = reportContext({
      visibility: { ...reportContext().visibility, visual: true }
    });
    const result = await createInventoryReport({
      rows: [{ ...mapInventoryItemToReportRow(tyre), imageUrl: '' }],
      context,
      logoUrl: ''
    });
    expect(result.rowCount).toBe(1);
    expect(result.pageCount).toBe(1);
  });

  it('prints the agent and terminal that generated the sheet', async () => {
    const result = await createInventoryReport({
      rows: [mapInventoryItemToReportRow(tyre)],
      context: reportContext({ generatedBy: 'Rafiek', terminalId: 'GP2' }),
      logoUrl: ''
    });
    const pdf = result.doc.output();
    expect(pdf).toContain('AGENT');
    expect(pdf).toContain('Rafiek');
    expect(pdf).toContain('TERMINAL');
    expect(pdf).toContain('GP2');
  });
});
