import { describe, expect, it } from 'vitest';
import { loadSupplierCatalogItems } from './supplierCatalogLoader';
import { SIDEBAR_SUPPLIER_CATALOGS } from './components/Sidebar';
import { calculateSupplierSellingPrice } from './supplierMarkup';
import { ProductType } from './types';

describe('LOMBARD TYRES catalogue', () => {
  it('makes the supplier and its price list available without claiming stock', async () => {
    expect(SIDEBAR_SUPPLIER_CATALOGS.map(item => item.label)).toContain('LOMBARD TYRES');
    const items = await loadSupplierCatalogItems('LOMBARD_TYRES');
    expect(items.length).toBeGreaterThan(275);
    const item = items.find(item => item.supplierStockCode === 'RID70048C');
    expect(item).toMatchObject({ supplierName: 'LOMBARD TYRES', size: '155/65R13', brand: 'GOODRIDE', costPrice: 660, sellingPrice: 759, stockQuantityUnknown: true });
    expect(calculateSupplierSellingPrice(item!, { mode: 'FIXED', value: 100 }, 'LOMBARD_TYRES')).toBe(874);
  });

  it('preserves commercial and flotation sizes from the source document', async () => {
    const items = await loadSupplierCatalogItems('LOMBARD_TYRES');
    expect(items.find(item => item.supplierStockCode === 'RID20056C')).toMatchObject({ size: '195/70R15C', supplierCategory: 'COMMERCIAL' });
    expect(items.find(item => item.supplierStockCode === 'KUM2415423')).toMatchObject({ size: '30X9.5R15' });
    expect(items.find(item => item.supplierStockCode === 'RID70052C')).toMatchObject({ supplierCategory: 'LIGHT TRUCK' });
    const passenger = items.find(item => item.supplierStockCode === 'RID70048C');
    expect(passenger).toMatchObject({ supplierCategory: 'PCR' });
    expect(passenger?.type).toBe(ProductType.TYRE);
    if (passenger?.type !== ProductType.TYRE) throw new Error('Expected a tyre');
    expect(passenger.tyreSpecs || '').not.toMatch(/\[|\(\s*\)/);
  });
});
