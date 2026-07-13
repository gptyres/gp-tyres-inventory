import { describe, expect, it } from 'vitest';
import {
  isLiveSupplierCatalog,
  isManualSupplierCatalog,
  isRegistryBackedSupplierCatalog,
  MANUAL_SUPPLIER_BY_CATALOG,
  REGISTRY_SUPPLIER_BY_CATALOG
} from './supplierCatalogMapping';

describe('supplier catalogue registry mapping', () => {
  it('maps frontend aliases to the exact registry supplier names', () => {
    expect(REGISTRY_SUPPLIER_BY_CATALOG.EXCLUSIVE_TYRES).toBe('Exclusive Tyres');
    expect(REGISTRY_SUPPLIER_BY_CATALOG.TREADS_UNLIMITED).toBe('Threads Unlimited');
    expect(REGISTRY_SUPPLIER_BY_CATALOG.SUMITOMO_DUNLOP).toBe('Sumitomo/Dunlop');
  });

  it('maps both Tyre Life catalogues to one registry job', () => {
    expect(REGISTRY_SUPPLIER_BY_CATALOG.TYRE_LIFE).toBe('Tyre Life');
    expect(REGISTRY_SUPPLIER_BY_CATALOG.TYRE_LIFE_WHEELS).toBe('Tyre Life');
  });

  it('keeps manual catalogues outside the portal registry but enables live snapshots', () => {
    expect(isRegistryBackedSupplierCatalog('SAILUN')).toBe(false);
    expect(isRegistryBackedSupplierCatalog('SAFETY_GRIP')).toBe(false);
    expect(isRegistryBackedSupplierCatalog('ARC')).toBe(false);
    expect(isRegistryBackedSupplierCatalog('APEX')).toBe(true);
    expect(isManualSupplierCatalog('SAILUN')).toBe(true);
    expect(isManualSupplierCatalog('SAFETY_GRIP')).toBe(true);
    expect(isLiveSupplierCatalog('SAILUN')).toBe(true);
    expect(isLiveSupplierCatalog('ARC')).toBe(false);
    expect(MANUAL_SUPPLIER_BY_CATALOG.SAILUN.sheetName).toBe('SUPPLIER_SAILUN');
  });
});
