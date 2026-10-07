import { describe, expect, it } from 'vitest';
import { restoreSupplierSearchSelection, serializeSupplierSearchSelection } from './supplierSearchSelection';

describe('all supplier search preferences', () => {
  const catalogs = ['APEX', 'VITOUR', 'JOM'];
  it('migrates outdated lists so newer catalogues are not silently excluded', () => {
    expect(restoreSupplierSearchSelection('["APEX"]', catalogs)).toEqual(catalogs);
    expect(restoreSupplierSearchSelection('invalid', catalogs)).toEqual(catalogs);
    expect(restoreSupplierSearchSelection(null, catalogs)).toEqual(catalogs);
  });
  it('includes future suppliers whenever All is selected', () => {
    const saved = serializeSupplierSearchSelection(catalogs, catalogs);
    expect(restoreSupplierSearchSelection(saved, [...catalogs, 'NEW'])).toEqual([...catalogs, 'NEW']);
  });
  it('preserves deliberate subsets and Clear without retaining deleted suppliers', () => {
    expect(restoreSupplierSearchSelection(serializeSupplierSearchSelection(['APEX'], catalogs), catalogs)).toEqual(['APEX']);
    expect(restoreSupplierSearchSelection(serializeSupplierSearchSelection([], catalogs), catalogs)).toEqual([]);
    expect(restoreSupplierSearchSelection(serializeSupplierSearchSelection(['DELETED'], catalogs), catalogs)).toEqual([]);
  });
});
