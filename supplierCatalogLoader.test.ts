import { describe, expect, it } from 'vitest';
import { normalizeBundledSupplierTyres } from './supplierCatalogLoader';
import { ProductType, type TyreProduct } from './types';

const bundledTyre: TyreProduct = {
  id: 'bundled-1',
  type: ProductType.TYRE,
  quantity: 8,
  sellingPrice: 4500,
  costPrice: 4000,
  lastUpdated: '2026-07-14',
  brand: 'COMPASAL',
  pattern: 'CPS60',
  size: '10.00R20',
  loadSpeedIndex: '18PR',
  location: 'Supplier'
};

describe('site-wide supplier catalogue formatting', () => {
  it('normalizes bundled fallback catalogues with the same fields as live catalogues', () => {
    const [item] = normalizeBundledSupplierTyres('APEX', [bundledTyre]);
    if (item.type !== ProductType.TYRE) throw new Error('Expected tyre item');
    expect(item).toMatchObject({
      supplierName: 'APEX',
      size: '10.00R20',
      brand: 'COMPASAL',
      pattern: 'CPS60',
      tyreRating: '18PR',
      tyreIndex: '',
      loadSpeedIndex: '18PR'
    });
  });
});
