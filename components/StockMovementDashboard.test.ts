import { describe, expect, it } from 'vitest';
import { buildStockMovementMetrics } from './StockMovementDashboard';
import { canViewStockMovementFinancials } from '../stockMovementAccess';

describe('stock movement dashboard visibility', () => {
  it('hides financial values outside admin mode', () => {
    const labels = buildStockMovementMetrics(null, false).map((metric) => metric.label);
    expect(labels).not.toContain('Cost value');
    expect(labels).not.toContain('Retail value');
  });

  it('shows financial values in admin mode', () => {
    const labels = buildStockMovementMetrics(null, true).map((metric) => metric.label);
    expect(labels).toContain('Cost value');
    expect(labels).toContain('Retail value');
  });

  it('uses the same financial layout for an authorized staff terminal', () => {
    const labels = buildStockMovementMetrics(
      null,
      canViewStockMovementFinancials('GP2')
    ).map((metric) => metric.label);
    expect(labels).toEqual(expect.arrayContaining(['Units sold today', 'Cost value', 'Retail value']));
  });
});
