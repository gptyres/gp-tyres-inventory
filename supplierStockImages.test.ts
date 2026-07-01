import { describe, expect, it } from 'vitest';
import {
  findBestSupplierStockImage,
  parseAlineImageFileName,
  parseAlineStockImageKeys
} from './supplierStockImages';

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
      designKey: 'NOBLE',
      finishKey: 'CHG',
      rimSize: null,
      pcd: null,
      publicImageUrl: 'https://example.test/noble-chg.jpg',
      fileName: 'Noble CHG side.jpg'
    },
    {
      designKey: 'NOBLE',
      finishKey: 'SILK BLACK',
      rimSize: null,
      pcd: null,
      publicImageUrl: 'https://example.test/noble-slblk.jpg',
      fileName: 'Noble SLBLK .jpg'
    },
    {
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
      imageDesignKey: 'BALTIC',
      imageFinishKey: 'GMMF',
      size: '19x8.5',
      pcd: '5/112'
    }, candidates);

    expect(match.confidence).toBe('missing');
    expect(match.imageUrl).toBeUndefined();
  });
});
