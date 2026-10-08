import { describe, expect, it } from 'vitest';
import { extractTyreServiceDescription as extract, getTyreServiceDescription, supplierSourceServiceDescription } from './tyreServiceDescription';

describe('supplier service descriptions', () => {
  it.each(['265/60R18 110H', '93WXL', 'LT265/70R17 121/118S', '225/40ZR18 92(Y)'])('reads confirmed rating from %s', value => {
    expect(extract(value).index).not.toBe('');
  });
  it.each(['265/60R18', '10PR', 'LRE', 'AT3G', 'GRANDTREK AT3', 'SKU121SFOO', '9.00R20', '265/65R17'])('does not invent ratings from %s', value => {
    expect(extract(value).index).toBe('');
  });
  it('keeps single/dual load indices and high-speed parentheses intact', () => {
    expect(extract('121 / 118 S')).toEqual({ load: '121/118', speed: 'S', index: '121/118S' });
    expect(extract('92(Y)').speed).toBe('(Y)');
    expect(extract('110H 112T').index).toBe('');
  });
  it('recovers legacy index even when other supplier specs exist', () => {
    expect(getTyreServiceDescription({ tyreSpecs: 'XL', loadSpeedIndex: '110H' }).index).toBe('110H');
  });
  it('reads ATT and Apex product-specific portal fields only', () => {
    expect(supplierSourceServiceDescription(JSON.stringify({ product: { ucIILoadRading: '111', ucIISpeedRating: 'T' } }))).toBe('111T');
    expect(supplierSourceServiceDescription(JSON.stringify({ raw: { load_rating: '121/118', speed_rating: 'S' } }))).toBe('121/118S');
    expect(supplierSourceServiceDescription(JSON.stringify({ raw: { index: '69', sku: '121S' }, previous: { description: '110H' } }))).toBe('');
    expect(supplierSourceServiceDescription('not json')).toBe('');
  });
});
