import { describe, expect, it } from 'vitest';
import { ProductType, type TyreProduct } from './types';
import { searchInventory } from './utils';
import { searchSupplierInventory } from './supplierInventorySearch';

const tyre = (id: string, size: string, overrides: Partial<TyreProduct> = {}): TyreProduct => ({
  id, size, type: ProductType.TYRE, brand: 'BF Goodrich', pattern: 'ContiSportContact 5',
  supplierName: 'APEX', supplierStockCode: 'TY-ABC123', quantity: 8, sellingPrice: 1000,
  costPrice: 800, lastUpdated: '', loadSpeedIndex: '91V', location: 'JHB', ...overrides
});

for (const [label, search] of [['supplier', searchSupplierInventory], ['available stock / POS', searchInventory]] as const) {
  describe(label + ' search regressions', () => {
    it.each(['CONTISPORTCONTACT', 'contisportcontact', 'ContiSportContact', 'Conti Sport Contact', 'BFGOODRICH', 'BF GOODRICH', 'APEX', 'ABC123', 'TY-ABC123', '205/55R16 APEX'])('finds %s', query => {
      expect(search([tyre('match', '205/55R16')], query)).toHaveLength(1);
    });
    it('includes run-flat, passenger and LT markers without matching different dimensions', () => {
      const stock = ['205/55RF16', 'P205/55R16', '205/55R16C', 'LT205/55R16', '205/55ZR16', '205/55R17'].map((size, i) => tyre(String(i), size));
      expect(search(stock, '2055516').map(item => item.id)).toEqual(['0', '1', '2', '3', '4']);
    });
    it('compares commercial width and rim numbers rather than decimal spelling', () => {
      const stock = ['7.50R16', '7.5R16LT', '7.50R17', '7.00R16'].map((size, i) => tyre(String(i), size));
      expect(search(stock, '7.5R16').map(item => item.id)).toEqual(['0', '1']);
      expect(search(stock, '7.5R18')).toEqual([]);
    });
    it('recognizes commercial metric widths and preserves decimal rim size', () => {
      const stock = ['195R15C', '195R14', '11.00R22.5', '11R22', '11R22.5'].map((size, i) => tyre(String(i), size));
      expect(search(stock, '195R15').map(item => item.id)).toEqual(['0']);
      expect(search(stock, '11R22.5').map(item => item.id)).toEqual(['2', '4']);
    });
    it('does not ignore a brand when matching partial numeric sizes', () => {
      expect(search([tyre('match', '205/55R16')], '20555 MICHELIN')).toEqual([]);
    });
    it('supports numeric tyre SKUs without losing matching size rows', () => {
      expect(search([tyre('sku', '205/55R16', { supplierStockCode: '9991234' })], '9991234')).toHaveLength(1);
      expect(search([tyre('other', '215/55R16', { supplierStockCode: '2055516' }), tyre('size', '205/55RF16')], '2055516').map(item => item.id)).toEqual(['size']);
    });
  });
}
