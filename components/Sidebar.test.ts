import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sidebar, SIDEBAR_SUPPLIER_CATALOGS } from './Sidebar';

describe('supplier catalogue sidebar order', () => {
  it('lists every supplier alphabetically by its displayed label', () => {
    const labels = SIDEBAR_SUPPLIER_CATALOGS.map(({ label }) => label);

    expect(labels).toHaveLength(28);
    expect(labels).toContain('VITOUR');
    expect(labels).toContain('JOM');
    expect(labels).toContain('EIBACH');
    expect(labels).toContain('HOOSIER TYRES');
    expect(labels).toEqual([...labels].sort((left, right) => left.localeCompare(right)));
  });

  it.each([false, true])('hides the legacy catalogue but keeps current Exclusive Tyres for admin=%s', (isAdmin) => {
    const noop = () => {};
    const markup = renderToStaticMarkup(React.createElement(Sidebar, {
      currentView: 'SUPPLIER_INVENTORY', activeFilter: 'ALL',
      onChangeView: noop, onFilterChange: noop,
      isOpen: true, setIsOpen: noop, isAdmin,
      onPortalSelect: noop, isDesktopOpen: true,
      onOpenDataSync: noop, onOpenCashUp: noop,
      activeSupplierCatalog: 'EXCLUSIVE_TYRES_NEW', onSupplierCatalogChange: noop
    }));

    expect(markup).not.toContain('EXCLUSIVE TYRES — LEGACY');
    expect(markup).toContain('>EXCLUSIVE TYRES</button>');
    expect(markup).not.toContain('EXCLUSIVE TYRES NEW — CURRENT');
    expect(markup).toContain('BRIDGESTONE');
  });
});
