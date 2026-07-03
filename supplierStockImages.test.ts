import { describe, expect, it } from 'vitest';
import {
  buildStaffSupplierTyreImageUploadPayload,
  buildSupplierImageMap,
  findBestSupplierStockImage,
  inventoryItemToSupplierImageLookup,
  parseAlineImageFileName,
  parseAlineStockImageKeys,
  parseSupplierTyreImageKeys,
  parseSupplierWheelImageKeys,
  supplierTyreMatchesUploadKeys
} from './supplierStockImages';
import { ProductType } from './types';
import { parseAttData, parseExoticData, parseExclusiveTyresData, parseStamfordData, parseSumitomoDunlopData, parseTreadZoneData, parseTyreLifeWheelsData, parseTyreWarehouseData } from './utils';

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

describe('TYREWAREHOUSE supplier catalogue parsing', () => {
  it('groups branch rows into one tyre item per SKU and rounds the VAT-inclusive selling price to the nearest R50', () => {
    const [item] = parseTyreWarehouseData([
      'SKU,Size,Brand,Pattern,Category,Stock Location,Stock Units Availability,Stock Units,Selling Price',
      '303426560181w,265/60R18,Continental,ContiCrossContact AT,Passenger / SUV Tyres,JHB,Out of stock,0 units,R3350',
      '303426560181w,265/60R18,Continental,ContiCrossContact AT,Passenger / SUV Tyres,GLK,Available,4 units,R3350',
      '303426560181w,265/60R18,Continental,ContiCrossContact AT,Passenger / SUV Tyres,CPT,Out of stock,0 units,R3350',
      '303426560181w,265/60R18,Continental,ContiCrossContact AT,Passenger / SUV Tyres,DBN,Out of stock,0 units,R3350'
    ].join('\n'));

    expect(item).toMatchObject({
      type: ProductType.TYRE,
      supplierName: 'TYREWAREHOUSE',
      supplierStockCode: '303426560181w',
      brand: 'Continental',
      pattern: 'ContiCrossContact AT',
      size: '265/60R18',
      quantity: 4,
      sellingPrice: 3850,
      costPrice: 3350,
      imageDesignKey: 'CONTICROSSCONTACT AT',
      imageFinishKey: 'CONTINENTAL'
    });
    expect(item.location).toContain('JHB: 0');
    expect(item.location).toContain('GLK: 4');
    expect(item.location).toContain('CPT: 0');
    expect(item.location).toContain('DBN: 0');
  });
});

describe('EXCLUSIVE TYRES supplier catalogue parsing', () => {
  it('removes import markers and load/speed clutter from tyre visual keys', () => {
    const items = parseExclusiveTyresData([
      'TYRE SIZE,BRAND & PATTERN,COST + VAT,STOCK UNITS',
      '225/45R17,TRACMAX IMP TRACMAX X privilo TX3,R900,12 units',
      '235/45R18,RADAR IMP RADAR DIMAX R8+ 105Y Z,R1100,5 units',
      '185/65R15,FIREMAX IMP 88H FM601,R600,20 units',
      '265/65R17,RADAR IMP RADAR 123 120S E RENEG.AT.SPORT,R1850,4 units',
      '165/50R15,TRACMAX - TYRES IMP 72V TRACMAX X privilo TX5,R550,20 units',
      '245/45R18,RADAR - TYRES IMP 100Y RADAR XL DMAX SPORT,R1500,20 units'
    ].join('\n'));

    expect(items.map((item) => item.pattern)).toEqual([
      'X Privilo TX3',
      'DIMAX R8+',
      'FM601',
      'Renegade AT Sport',
      'X Privilo TX5',
      'DIMAX SPORT'
    ]);
    expect(items.map((item) => item.imageDesignKey)).toEqual([
      'X PRIVILO TX3',
      'DIMAX R8',
      'FM601',
      'RENEGADE AT SPORT',
      'X PRIVILO TX5',
      'DIMAX SPORT'
    ]);
  });
});

describe('TREAD ZONE supplier catalogue parsing', () => {
  it('groups branch rows into one tyre item per SKU and rounds the VAT-inclusive selling price to the nearest R50', () => {
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
      sellingPrice: 900,
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
  it('groups branch rows into one tyre item per SKU and rounds the VAT-inclusive selling price to the nearest R50', () => {
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
      sellingPrice: 2150,
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

describe('EXOTIC supplier catalogue parsing', () => {
  it('ignores alloy wheels and groups tyre availability rows into one tyre item per SKU', () => {
    const items = parseExoticData([
      'Supplier,Brand,Product Name,Category,Size,Stock Location,Stock Units Availability,Stock Units,Selling Price,SKU,Product URL',
      'Exotic,Evolution Racing,"15"" Cairo 4/100 8.25J ET15 CH73.1 Evolution Racing GomlL Wheel",Alloy Wheels,Unknown Size,Cape Town,Available,Not shown,R1249,EWT1203,https://example.test/wheel',
      'Exotic,Accelera,155/65R14 Accelera Eco Plush 75H Tyre,Tyres,155/65R14,Cape Town,Available,Not shown,R585,A1556514ECOP75H,https://example.test/tyre',
      'Exotic,Accelera,155/65R14 Accelera Eco Plush 75H Tyre,Tyres,155/65R14,Johannesburg,Available,Not shown,R585,A1556514ECOP75H,https://example.test/tyre'
    ].join('\n'));

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: ProductType.TYRE,
      supplierName: 'EXOTIC',
      supplierStockCode: 'A1556514ECOP75H',
      brand: 'Accelera',
      pattern: 'Eco Plush',
      size: '155/65R14',
      quantity: 2,
      sellingPrice: 585,
      costPrice: 585,
      imageDesignKey: 'ECO PLUSH',
      imageFinishKey: 'ACCELERA'
    });
    expect(items[0].location).toContain('Cape Town: Available');
    expect(items[0].location).toContain('Johannesburg: Available');
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

  it('builds deterministic staff-upload payloads for one supplier tyre pattern', () => {
    const [item] = parseAttData([
      'SIZE,BRAND_PATTERN,CATEGORY,PRICE,QTY',
      '265/65R17,Dunlop - Grandtrek AT3G,SUV,R2999,4'
    ].join('\n'));

    const payload = buildStaffSupplierTyreImageUploadPayload({
      item,
      brand: 'Dunlop',
      pattern: 'Grandtrek AT3G',
      fileName: 'grandtrek-at3g.jpg',
      mimeType: 'image/jpeg',
      base64: 'abc123',
      hash: 'feedface',
      uploadedBy: 'GP2'
    });

    expect(payload).toMatchObject({
      supplier: 'ATT',
      source: 'staff-upload',
      sourceFileId: 'staff-upload:att:dunlop:grandtrek-at3g',
      fileName: 'grandtrek-at3g.jpg',
      storagePath: 'tyres/staff-upload/att/dunlop/grandtrek-at3g/feedface.jpg',
      mimeType: 'image/jpeg',
      designKey: 'GRANDTREK AT3G',
      finishKey: 'DUNLOP',
      base64: 'abc123',
      uploadedBy: 'GP2'
    });
    expect(payload.tags).toContain('staff-upload');
    expect(payload.tags).toContain('uploaded-by:GP2');
  });

  it('applies one uploaded supplier tyre image to matching rows from the same supplier pattern', () => {
    const [first, second, otherSupplier] = [
      ...parseAttData([
        'SIZE,BRAND_PATTERN,CATEGORY,PRICE,QTY',
        '265/65R17,Dunlop - Grandtrek AT3G,SUV,R2999,4',
        '245/70R16,Dunlop - Grandtrek AT3G,SUV,R2799,2'
      ].join('\n')),
      ...parseTyreWarehouseData([
        'SKU,Size,Brand,Pattern,Category,Stock Location,Stock Units Availability,Stock Units,Selling Price',
        'tw-1,265/65R17,Dunlop,Grandtrek AT3G,Passenger / SUV Tyres,JHB,Available,3 units,R2500'
      ].join('\n'))
    ];

    expect(supplierTyreMatchesUploadKeys(first, 'ATT', 'Dunlop', 'Grandtrek AT3G')).toBe(true);
    expect(supplierTyreMatchesUploadKeys(second, 'ATT', 'Dunlop', 'Grandtrek AT3G')).toBe(true);
    expect(supplierTyreMatchesUploadKeys(otherSupplier, 'ATT', 'Dunlop', 'Grandtrek AT3G')).toBe(false);

    const imageMap = buildSupplierImageMap([first, second, otherSupplier], [{
      id: 'image-1',
      supplier: 'ATT',
      source: 'staff-upload',
      source_file_id: 'staff-upload:att:dunlop:grandtrek-at3g',
      file_name: 'grandtrek-at3g.jpg',
      storage_bucket: 'supplier-stock-images',
      storage_path: 'tyres/staff-upload/att/dunlop/grandtrek-at3g/feedface.jpg',
      public_image_url: 'https://example.test/grandtrek-at3g.jpg',
      mime_type: 'image/jpeg',
      design_key: 'GRANDTREK AT3G',
      finish_key: 'DUNLOP',
      rim_size: null,
      pcd: null,
      tags: ['staff-upload'],
      active: true,
      imported_at: '2026-07-03T00:00:00.000Z'
    }]);

    expect(imageMap[first.id]).toBe('https://example.test/grandtrek-at3g.jpg');
    expect(imageMap[second.id]).toBe('https://example.test/grandtrek-at3g.jpg');
    expect(imageMap[otherSupplier.id]).toBeUndefined();
  });
});
