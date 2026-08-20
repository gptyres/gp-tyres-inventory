import { describe, expect, it } from 'vitest';
import { extractDroppedVisualUrl, formatBulkClipboardText, getCoiloverDetails, getItemDisplayName, getItemSecondaryLine, getItemSupplierName, getSupportedStaffImageMimeType, getWarehouseStockSummary, isSpecialItem } from './InventoryView';
import { ProductType, type CoiloverProduct, type TyreProduct, type WheelProduct } from '../types';

const supplierTyre: TyreProduct = {
  id: 'live-apex-cps60',
  type: ProductType.TYRE,
  quantity: 20,
  sellingPrice: 4500,
  costPrice: 4000,
  lastUpdated: '2026-07-14',
  supplierName: 'Apex',
  supplierLeadTime: '6 Hours',
  brand: 'COMPASAL',
  pattern: 'CPS60',
  size: '10.00R20',
  loadSpeedIndex: '18PR / 149/146K',
  tyreRating: '18PR',
  tyreIndex: '149/146K',
  tyreSpecs: 'TL',
  location: 'Apex | In stock'
};

describe('supplier tyre card formatting', () => {
  it('uses size, brand, and pattern for the primary line', () => {
    expect(getItemDisplayName(supplierTyre)).toBe('10.00R20 COMPASAL CPS60');
  });

  it('uses rating, index, and remaining specs for the secondary line', () => {
    expect(getItemSecondaryLine(supplierTyre)).toBe('18PR / 149/146K / TL');
    expect(isSpecialItem({ ...supplierTyre, tyreSpecs: 'TL / SPECIAL' })).toBe(true);
  });

  it('provides a consistent supplier label for all-supplier search results', () => {
    expect(getItemSupplierName(supplierTyre)).toBe('APEX');
    expect(getItemSupplierName({ ...supplierTyre, supplierName: undefined })).toBe('');
  });

  it('leaves unavailable supplier fields blank', () => {
    const incomplete = {
      ...supplierTyre,
      brand: 'Unknown',
      pattern: 'Standard',
      tyreRating: '',
      tyreIndex: '',
      tyreSpecs: '',
      loadSpeedIndex: ''
    };
    expect(getItemDisplayName(incomplete)).toBe('10.00R20');
    expect(getItemSecondaryLine(incomplete)).toBe('');
  });
});

describe('supplier tyre visual drag and drop', () => {
  it('accepts image files whose browser omits the MIME type', () => {
    expect(getSupportedStaffImageMimeType({ name: 'grandtrek-at3g.JPG', type: '' })).toBe('image/jpeg');
    expect(getSupportedStaffImageMimeType({ name: 'terramax.webp', type: 'application/octet-stream' })).toBe('image/webp');
  });

  it('rejects non-image drops', () => {
    expect(getSupportedStaffImageMimeType({ name: 'supplier-pricing.pdf', type: 'application/pdf' })).toBe('');
  });

  it('accepts direct HTTPS images dragged from another browser tab', () => {
    expect(extractDroppedVisualUrl({
      html: '<a href="https://brand.example/product"><img src="https://cdn.example.com/tyres/at3g.webp?width=900" /></a>'
    })).toBe('https://cdn.example.com/tyres/at3g.webp?width=900');
    expect(extractDroppedVisualUrl({
      uriList: '# first line is a comment\nhttps://cdn.example.com/wheels/dx381.png'
    })).toBe('https://cdn.example.com/wheels/dx381.png');
  });

  it('rejects insecure or executable dragged URLs', () => {
    expect(extractDroppedVisualUrl({ plainText: 'http://cdn.example.com/tyre.jpg' })).toBe('');
    expect(extractDroppedVisualUrl({ uriList: 'javascript:alert(1)' })).toBe('');
  });
});

describe('EIBACH lowering-kit card formatting', () => {
  const loweringKit: CoiloverProduct = {
    id: 'eibach-3648',
    type: ProductType.COILOVER,
    brand: 'EIBACH',
    series: 'PRO-KIT',
    vehicleCompatibility: 'BMW 7 Series 730i 735i 740i 750i 1994 - 2001',
    vehicleBrand: 'BMW',
    vehicleModel: '7 Series',
    yearRange: '1994 - 2001',
    frontLowering: '30mm',
    rearLowering: '30mm',
    stockStatus: '1 in stock',
    location: 'Eibach SA',
    stockByLocation: { 'Eibach SA': 1 },
    quantity: 1,
    costPrice: 9655,
    sellingPrice: 12050,
    supplierName: 'EIBACH',
    supplierStockCode: '2049-140',
    lastUpdated: '2026-08-20'
  };

  it('keeps the complete vehicle fitment on the main line', () => {
    expect(getItemDisplayName(loweringKit)).toBe('BMW 7 Series 730i 735i 740i 750i 1994 - 2001');
    expect(getItemSecondaryLine(loweringKit)).toBe('EIBACH PRO-KIT');
  });

  it('shows vehicle, lowering, and SKU details on the card', () => {
    expect(getCoiloverDetails(loweringKit)).toBe(
      'BMW / 7 Series / 1994 - 2001 / Front 30mm / Rear 30mm / SKU 2049-140'
    );
  });
});

describe('customer stock clipboard formatting', () => {
  it('copies available tyres under each other in the current item order', () => {
    const secondTyre: TyreProduct = {
      ...supplierTyre,
      id: 'live-apex-grabber',
      size: '31X10.50R15',
      brand: 'BF GOODRICH',
      pattern: 'LT MUD TERRAIN T/A KM3 LRC GO',
      sellingPrice: 5999,
      quantity: 4
    };

    expect(formatBulkClipboardText([supplierTyre, secondTyre])).toBe([
      '10.00R20 COMPASAL CPS60 @ R4500',
      '31X10.50R15 BF GOODRICH LT MUD TERRAIN T/A KM3 LRC GO @ R5999'
    ].join('\n'));
  });

  it('does not include zero-stock products in a customer availability message', () => {
    expect(formatBulkClipboardText([{ ...supplierTyre, quantity: 0 }])).toBe('');
  });

  it('removes repeated product text and keeps the lowest-priced duplicate', () => {
    const duplicateTyres: TyreProduct[] = [
      {
        ...supplierTyre,
        id: 'apex-alnac',
        size: '195/50R15',
        brand: 'Apollo',
        pattern: '195/50R15 Apollo Alnac 4G Tyre',
        sellingPrice: 1450,
        quantity: 3
      },
      {
        ...supplierTyre,
        id: 'exclusive-alnac',
        size: '195/50R15',
        brand: 'APOLLO',
        pattern: 'ALNAC 4G',
        sellingPrice: 1375,
        quantity: 2
      }
    ];

    expect(formatBulkClipboardText(duplicateTyres)).toBe('195/50R15 APOLLO ALNAC 4G @ R1375');
  });

  it('capitalizes every letter in bulk clipboard output', () => {
    const mixedCaseWheel: WheelProduct = {
      id: 'aline-dazzle',
      type: ProductType.WHEEL,
      quantity: 2,
      sellingPrice: 3200,
      costPrice: 2800,
      lastUpdated: '2026-08-05',
      code: 'Dazzle',
      brand: 'Aline',
      finish: 'Gloss Black',
      size: '15x6.5',
      pcd: '4/100',
      offset: '35',
      centerBore: '67.1',
      colour: 'Aline | Gloss Black',
      setQuantity: 1,
      location: 'CPT: 2'
    };

    const clipboardText = formatBulkClipboardText([mixedCaseWheel]);
    expect(clipboardText).toBe(clipboardText.toUpperCase());
    expect(clipboardText).toContain('DAZZLE GLOSS BLACK');
  });

  it('totals all verified warehouses without dropping non-Cape-Town stock', () => {
    expect(getWarehouseStockSummary([
      { ...supplierTyre, id: 'one', quantity: 9, stockByLocation: { CPT: 2, JHB: 5, DUR: 2 } },
      { ...supplierTyre, id: 'two', quantity: 5, stockByLocation: { CPT: 1, PLZ: 4 } }
    ])).toEqual([
      ['JHB', 5],
      ['CPT', 3],
      ['DUR', 2],
      ['PLZ', 4]
    ]);
  });
});

describe('supplier wheel card formatting', () => {
  const dirtyLifeWheel: WheelProduct = {
    id: 'live-tyre-life-wheels-a9303',
    type: ProductType.WHEEL,
    quantity: 8,
    sellingPrice: 4850,
    costPrice: 4850,
    lastUpdated: '2026-07-15',
    supplierName: 'TYRE LIFE WHEELS',
    supplierStockCode: 'SAA8306-2983MB',
    imageDesignKey: 'A8306 MAYHEM RIDGELINE',
    imageFinishKey: 'SATIN BLACK',
    code: 'A8306 MAYHEM RIDGELINE',
    brand: 'Dirty Life',
    finish: 'Satin Black',
    size: '20X9',
    pcd: '139.7',
    offset: '18',
    centerBore: '106',
    colour: 'Dirty Life | Satin Black',
    setQuantity: 1,
    location: 'JHB: 8 | CPT: 0 | DBN: 0',
    stockByLocation: { JHB: 8, CPT: 0, DBN: 0 }
  };

  it('shows brand, finish, size, PCD, offset and centre bore', () => {
    expect(getItemDisplayName(dirtyLifeWheel)).toBe('A8306 MAYHEM RIDGELINE');
    expect(getItemSecondaryLine(dirtyLifeWheel)).toBe('Dirty Life / SATIN BLACK / 20X9 / 139.7 / ET18 / CB 106');
  });
});
