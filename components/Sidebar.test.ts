import { describe, expect, it } from 'vitest';
import { SIDEBAR_SUPPLIER_CATALOGS } from './Sidebar';

describe('supplier catalogue sidebar order', () => {
  it('lists every supplier alphabetically by its displayed label', () => {
    const labels = SIDEBAR_SUPPLIER_CATALOGS.map(({ label }) => label);

    expect(labels).toHaveLength(26);
    expect(labels).toContain('EIBACH');
    expect(labels).toContain('HOOSIER TYRES');
    expect(labels).toEqual([...labels].sort((left, right) => left.localeCompare(right)));
  });
});
