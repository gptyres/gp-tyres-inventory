import { describe, expect, it } from 'vitest';
import {
  findBestSupplierStockImage,
  parseAlineImageFileName,
  parseAlineStockImageKeys,
  parseSupplierTyreImageKeys
} from './supplierStockImages';
import { ProductType } from './types';
import { parseAttData } from './utils';

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
