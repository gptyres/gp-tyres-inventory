import { describe, expect, it } from 'vitest';
import {
  findBestSupplierStockImage,
  inventoryItemToSupplierImageLookup,
  parseAlineImageFileName,
  parseAlineStockImageKeys,
  parseSupplierTyreImageKeys,
  parseSupplierWheelImageKeys
} from './supplierStockImages';
import { ProductType } from './types';
import { parseAttData, parseStamfordData, parseSumitomoDunlopData, parseTreadZoneData, parseTyreLifeWheelsData } from './utils';

describe('ALINE supplier image parsing', () => {
  it('extracts design and finish keys from compact ALINE stock descriptions', () => {
    expect(parseAlineStockImageKeys('410014X6/108CLASSIC ET34 BKMF')).toEqual({
      designKey: 'CLASSIC',
      finishKey: 'GMMF'
    });

    expect(parseAlineStockImageKeys('512019X8.5DYNAMIC ET33F VELBLK Flow Form 72.6')).toEqual({
      designKey: 'DYNAMIC',
      finishKey: 'VELVET BLACK'
    });
  });

  it('extracts design, finish and size hints from image file names', () => {
    expect(parseAlineImageFileName("Le Mans ARCTIC SILVER18'' side.jpg")).toMatchObject({
      designKey: 'LE MANS',
      finishKey: 'ARCTIC SILVER',
      rimSize: '18'
    });

    expect(parseAlineImageFileName('Noble SLBLK .jpg')).toMatchObject({
      designKey: 'NOBLE',
      finishKey: 'SILK BLACK'
    });
  });

  it('normalizes compact ALINE steel and AR design names from stock rows', () => {
    expect(parseAlineStockImageKeys('410015X7AR-1 35 GM RSPEC 73.1 + TRACK USE')).toMatchObject({
      designKey: 'AR Z2'
    });

    expect(parseAlineStockImageKeys('613918X9 STBK Soft8 B/XF CB106.2 1250kg load')).toMatchObject({
      designKey: 'STEEL SOFT 8'
    });

    expect(parseAlineStockImageKeys('613914X7 STBLK MOD Dual Red Pinstripe 920kg')).toMatchObject({
      designKey: 'STEEL MODULAR BLACK'
    });
  });
});

describe('TYRE LIFE wheel catalogue parsing', () => {
  it('parses VAT-inclusive wheel rows with branch stock and visual keys', () => {
    const [item] = parseTyreLifeWheelsData([
      'Size,SKU,Brand,Wheel Name,Finish,PCD,Offset,Center Bore,Category,Selling Price,JHB Stock Units,CPT Stock Units,DBN Stock Units,Total Stock Units',
      '"20” x 9""",SAA8306-2983MB,Dirty Life,A8306 MAYHEM RIDGELINE,Satin Black,139.7,18,106,Wheels,R4850,8 units,0 units,0 units,8 units'
    ].join('\n'));

    expect(item).toMatchObject({
      type: ProductType.WHEEL,
      supplierName: 'TYRE LIFE WHEELS',
      supplierStockCode: 'SAA8306-2983MB',
      imageDesignKey: 'A8306 MAYHEM RIDGELINE',
      imageFinishKey: 'SATIN BLACK',
      code: 'A8306 MAYHEM RIDGELINE',
      size: '20x9',
      pcd: '139.7',
      offset: '18',
      centerBore: '106',
      quantity: 8,
      sellingPrice: 4850,
      costPrice: 4850
    });
  });

  it('collapses repeated branded wheel names to one design key', () => {
    expect(parseSupplierWheelImageKeys('Dirty Life', 'A9303 DT1', 'Matte Black W/Simulated Ring')).toEqual({
      designKey: 'A9303 DT1',
      finishKey: 'MATTE BLACK W SIMULATED RING'
    });

    expect(parseSupplierWheelImageKeys('Dirty Life', 'Dirty Life A9303 DT1', 'Matte Black W/Simulated Ring')).toEqual({
      designKey: 'A9303 DT1',
      finishKey: 'MATTE BLACK W SIMULATED RING'
    });

    expect(parseSupplierWheelImageKeys('Dirty Life', 'Dirty Life ROADKILL', 'Matte Black W/ Matte Black Lip', 'SAA9301-7850MB6N')).toEqual({
      designKey: 'A9301 ROADKILL',
      finishKey: 'MATTE BLACK W MATTE BLACK LIP'
    });
  });

  it('normalizes Dynamic Steel catalogue prefixes to reusable design keys', () => {
    expect(parseSupplierWheelImageKeys('Dynamic Steel Wheels', 'Dymanic Steel BEADLOCK IMITATION', 'Black Triangle')).toEqual({
      designKey: 'BEADLOCK IMITATION',
      finishKey: 'BLACK TRIANGLE'
    });

    expect(parseSupplierWheelImageKeys('Dynamic Steel Wheels', 'Dymanic Steel DYNAMIC SUNRAYSIA', 'Black Triangle')).toEqual({
      designKey: 'DYNAMIC SUNRAYSIA',
      finishKey: 'BLACK TRIANGLE'
    });
  });

  it('enables supplier image lookups for TYRE LIFE WHEELS wheel rows', () => {
    const [item] = parseTyreLifeWheelsData([
      'Size,SKU,Brand,Wheel Name,Finish,PCD,Offset,Center Bore,Category,Selling Price,JHB Stock Units,CPT Stock Units,DBN Stock Units,Total Stock Units',
      '"17 x 9""",SAA9303-7983MB12N,Dirty Life,Dirty Life A9303 DT1,Matte Black W/Simulated Ring,139.7,--12,,Wheels,R5200,0 units,0 units,0 units,0 units'
    ].join('\n'));

    expect(inventoryItemToSupplierImageLookup(item)).toMatchObject({
      supplierName: 'TYRE LIFE WHEELS',
      supplierStockCode: 'SAA9303-7983MB12N',
      imageDesignKey: 'A9303 DT1',
      imageFinishKey: 'MATTE BLACK W SIMULATED RING'
    });
  });
});

describe('STAMFORD supplier catalogue parsing', () => {
  it('groups branch stock rows into one tyre item per SKU', () => {
    const [item] = parseStamfordData([
      'SKU,Brand,Pattern,Size,Category,Stock Location,Stock Units Availability,Stock Units',
      'LRBH077,Blackhawk,Hiscend-H Ha01,LT235/75R15,SUV and 4x4 / All Terrain,Cape Town,Available,2 units',
      'LRBH077,Blackhawk,Hiscend-H Ha01,LT235/75R15,SUV and 4x4 / All Terrain,Durban,Out of stock,0 units',
      'LRBH077,Blackhawk,Hiscend-H Ha01,LT235/75R15,SUV and 4x4 / All Terrain,Johannesburg,Available,3 units'
    ].join('\n'), { LRBH077: 1450 });

    expect(item).toMatchObject({
      type: ProductType.TYRE,
      supplierName: 'STAMFORD',
      supplierStockCode: 'LRBH077',
      brand: 'Blackhawk',
      pattern: 'Hiscend-H Ha01',
      size: 'LT235/75R15',
      quantity: 5,
      sellingPrice: 1450,
      costPrice: 1450,
      imageDesignKey: 'HISCEND H HA01',
      imageFinishKey: 'BLACKHAWK'
    });
    expect(item.location).toContain('Cape Town: 2');
    expect(item.location).toContain('Durban: 0');
    expect(item.location).toContain('Johannesburg: 3');
  });
});

describe('TREAD ZONE supplier catalogue parsing', () => {
  it('groups branch rows into one tyre item per SKU with supplier pricing', () => {
    const [item] = parseTreadZoneData([
      'SKU,Category,Brand,Pattern,Tyre Size,Stock Location,Stock Units Availability,Stock Units,Price',
      '1.01.016.121,Agricultural > Bias,Farm Master,F2,6.00-16,Treadzone Cape Town,Available,30 units,R773.50',
      '1.01.016.121,Agricultural > Bias,Farm Master,F2,6.00-16,Treadzone Durban,Available,15 units,R773.50',
      '1.01.016.121,Agricultural > Bias,Farm Master,F2,6.00-16,Treadzone Jet Park,Available,120 units,R773.50',
      '1.01.016.121,Agricultural > Bias,Farm Master,F2,6.00-16,Treadzone Port Elizabeth,Available,12 units,R773.50'
    ].join('\n'));

    expect(item).toMatchObject({
      type: ProductType.TYRE,
      supplierName: 'TREAD ZONE',
      supplierStockCode: '1.01.016.121',
      brand: 'Farm Master',
      pattern: 'F2',
      size: '6.00-16',
      quantity: 177,
      sellingPrice: 773.5,
      costPrice: 773.5,
      imageDesignKey: 'F2',
      imageFinishKey: 'FARM MASTER'
    });
    expect(item.location).toContain('Cape Town: 30');
    expect(item.location).toContain('Durban: 15');
    expect(item.location).toContain('Jet Park: 120');
    expect(item.location).toContain('Port Elizabeth: 12');
  });
});

describe('SUMITOMO/DUNLOP supplier catalogue parsing', () => {
  it('groups branch rows into one tyre item per SKU with supplier pricing', () => {
    const [item] = parseSumitomoDunlopData([
      'SKU,Category,Brand,Pattern,Tyre Size,Stock Location,Stock Units Availability,Stock Units,Price',
      'G10591287DJ,Car Steel,Dunlop,EC300+,185/60R16,Cape Town,Available,18 units,R1870.62',
      'G10591287DJ,Car Steel,Dunlop,EC300+,185/60R16,Durban,Available,16 units,R1870.62',
      'G10591287DJ,Car Steel,Dunlop,EC300+,185/60R16,Durban CDC,Available,19 units,R1870.62',
      'G10591287DJ,Car Steel,Dunlop,EC300+,185/60R16,Eastport,Available,40 units,R1870.62',
      'G10591287DJ,Car Steel,Dunlop,EC300+,185/60R16,Ladysmith,Available,17 units,R1870.62',
      'G10591287DJ,Car Steel,Dunlop,EC300+,185/60R16,Port Elizabeth,Available,10 units,R1870.62'
    ].join('\n'));

    expect(item).toMatchObject({
      type: ProductType.TYRE,
      supplierName: 'SUMITOMO/DUNLOP',
      supplierStockCode: 'G10591287DJ',
      brand: 'Dunlop',
      pattern: 'EC300+',
      size: '185/60R16',
      quantity: 120,
      sellingPrice: 1870.62,
      costPrice: 1870.62,
      imageDesignKey: 'EC300',
      imageFinishKey: 'DUNLOP'
    });
    expect(item.location).toContain('Cape Town: 18');
    expect(item.location).toContain('Durban: 16');
    expect(item.location).toContain('Durban CDC: 19');
    expect(item.location).toContain('Eastport: 40');
    expect(item.location).toContain('Ladysmith: 17');
    expect(item.location).toContain('Port Elizabeth: 10');
  });
});

describe('supplier stock image matching', () => {
  const candidates = [
    {
      supplierName: 'ALINE',
      designKey: 'NOBLE',
      finishKey: 'CHG',
      rimSize: null,
      pcd: null,
      publicImageUrl: 'https://example.test/noble-chg.jpg',
      fileName: 'Noble CHG side.jpg'
    },
    {
      supplierName: 'ALINE',
      designKey: 'NOBLE',
      finishKey: 'SILK BLACK',
      rimSize: null,
      pcd: null,
      publicImageUrl: 'https://example.test/noble-slblk.jpg',
      fileName: 'Noble SLBLK .jpg'
    },
    {
      supplierName: 'ALINE',
      designKey: 'DYNAMIC',
      finishKey: 'GRAPHITE',
      rimSize: null,
      pcd: null,
      publicImageUrl: 'https://example.test/dynamic.jpg',
      fileName: 'Dynamic GRAPHITE.jpg'
    }
  ];

  it('prefers matching finish within the same design', () => {
    const match = findBestSupplierStockImage({
      id: 'aline-1',
      productType: ProductType.WHEEL,
      supplierName: 'ALINE',
      imageDesignKey: 'NOBLE',
      imageFinishKey: 'SILK BLACK',
      size: '19x8.5',
      pcd: '5/112'
    }, candidates);

    expect(match.confidence).toBe('exact');
    expect(match.imageUrl).toBe('https://example.test/noble-slblk.jpg');
  });

  it('does not match a different design', () => {
    const match = findBestSupplierStockImage({
      id: 'aline-2',
      productType: ProductType.WHEEL,
      supplierName: 'ALINE',
      imageDesignKey: 'BALTIC',
      imageFinishKey: 'GMMF',
      size: '19x8.5',
      pcd: '5/112'
    }, candidates);

    expect(match.confidence).toBe('missing');
    expect(match.imageUrl).toBeUndefined();
  });

  it('keeps TYRE LIFE WHEELS matches finish-aware across repeated sizes', () => {
    const supplierCandidates = [
      {
        supplierName: 'TYRE LIFE WHEELS',
        designKey: 'A9303 DT1',
        finishKey: 'MATTE BLACK W SIMULATED RING',
        rimSize: null,
        pcd: null,
        publicImageUrl: 'https://example.test/a9303-black.jpg',
        fileName: 'a9303-black.jpg'
      },
      {
        supplierName: 'TYRE LIFE WHEELS',
        designKey: 'A9303 DT1',
        finishKey: 'MATTE GUNMETAL W SIMULATED RING',
        rimSize: null,
        pcd: null,
        publicImageUrl: 'https://example.test/a9303-gunmetal.jpg',
        fileName: 'a9303-gunmetal.jpg'
      }
    ];

    const match = findBestSupplierStockImage({
      id: 'tyrelifewheels-1',
      productType: ProductType.WHEEL,
      supplierName: 'TYRE LIFE WHEELS',
      imageDesignKey: 'A9303 DT1',
      imageFinishKey: 'MATTE BLACK W SIMULATED RING',
      size: '17x9',
      pcd: '139.7'
    }, supplierCandidates);

    expect(match.confidence).toBe('exact');
    expect(match.imageUrl).toBe('https://example.test/a9303-black.jpg');
  });

  it('uses a same-design TYRE LIFE WHEELS image as a fallback when exact finish is unavailable', () => {
    const match = findBestSupplierStockImage({
      id: 'tyrelifewheels-2',
      productType: ProductType.WHEEL,
      supplierName: 'TYRE LIFE WHEELS',
      imageDesignKey: 'A9303 DT1',
      imageFinishKey: 'MATTE BLACK W SIMULATED RING',
      size: '17x9',
      pcd: '139.7'
    }, [
      {
        supplierName: 'TYRE LIFE WHEELS',
        designKey: 'A9303 DT1',
        finishKey: 'MATTE GUNMETAL W SIMULATED RING',
        rimSize: null,
        pcd: null,
        publicImageUrl: 'https://example.test/a9303-gunmetal.jpg',
        fileName: 'a9303-gunmetal.jpg'
      }
    ]);

    expect(match.confidence).toBe('best');
    expect(match.imageUrl).toBe('https://example.test/a9303-gunmetal.jpg');
  });
});

describe('supplier tyre image parsing and matching', () => {
  it('uses tyre pattern as the primary visual key and brand as the secondary key', () => {
    expect(parseSupplierTyreImageKeys('Sailun', 'Terramax RT')).toEqual({
      designKey: 'TERRAMAX RT',
      finishKey: 'SAILUN'
    });

    expect(parseSupplierTyreImageKeys('Dunlop', 'Grandtrek AT3G')).toEqual({
      designKey: 'GRANDTREK AT3G',
      finishKey: 'DUNLOP'
    });
  });

  it('keeps supplier tyre image matches inside the same supplier', () => {
    const match = findBestSupplierStockImage({
      id: 'sailun-1',
      productType: ProductType.TYRE,
      supplierName: 'SAILUN',
      imageDesignKey: 'TERRAMAX RT',
      imageFinishKey: 'SAILUN',
      size: '265/65R17'
    }, [
      {
        supplierName: 'TUBESTONE',
        designKey: 'TERRAMAX RT',
        finishKey: 'SAILUN',
        rimSize: null,
        pcd: null,
        publicImageUrl: 'https://example.test/tubestone-terramax.jpg',
        fileName: 'tubestone-terramax.jpg'
      },
      {
        supplierName: 'SAILUN',
        designKey: 'TERRAMAX RT',
        finishKey: 'SAILUN',
        rimSize: null,
        pcd: null,
        publicImageUrl: 'https://example.test/sailun-terramax.jpg',
        fileName: 'sailun-terramax.jpg'
      }
    ]);

    expect(match.confidence).toBe('exact');
    expect(match.imageUrl).toBe('https://example.test/sailun-terramax.jpg');
  });

  it('adds supplier tyre image metadata while parsing supplier catalogues', () => {
    const [item] = parseAttData([
      'SIZE,BRAND_PATTERN,CATEGORY,PRICE,QTY',
      '265/65R17,Dunlop - Grandtrek AT3G,SUV,R2999,4'
    ].join('\n'));

    expect(item).toMatchObject({
      type: ProductType.TYRE,
      supplierName: 'ATT',
      supplierStockCode: 'att-1',
      imageDesignKey: 'GRANDTREK AT3G',
      imageFinishKey: 'DUNLOP'
    });
  });
});
