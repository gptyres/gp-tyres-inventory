import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StatsDashboard } from './StatsDashboard';

describe('inventory summary permissions', () => {
  const stats = { totalItems: 105, lowStockCount: 3, totalValueRetail: 123456, totalValueCost: 98765 };
  it('omits valuations from the sales-user markup', () => {
    const html = renderToStaticMarkup(<StatsDashboard stats={stats} visible={false} />);
    expect(html).toContain('Units in stock');
    expect(html).toContain('Low stock products');
    expect(html).not.toContain('Retail stock value');
    expect(html).not.toContain('Cost stock value');
  });
  it('includes valuations only for admin and exposes available navigation as buttons', () => {
    const html = renderToStaticMarkup(<StatsDashboard stats={stats} visible onStockClick={() => {}} onLowStockClick={() => {}} />);
    expect(html).toContain('Retail stock value');
    expect(html).toContain('Cost stock value');
    expect((html.match(/<button/g) || []).length).toBe(2);
  });
});
