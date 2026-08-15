import { describe, expect, it } from 'vitest';
import { buildStockMovementMetrics, getStockMovementMetricDisplayValue } from './StockMovementDashboard';
import { canViewStockMovementFinancials } from '../stockMovementAccess';

describe('stock movement dashboard visibility', () => {
  it('hides financial values outside admin mode', () => {
    const labels = buildStockMovementMetrics(null, false).map((metric) => metric.label);
    expect(labels).not.toContain('Cost value');
    expect(labels).not.toContain('Retail value');
  });

  it('shows financial values in admin mode', () => {
    const metrics = buildStockMovementMetrics(null, true);
    const labels = metrics.map((metric) => metric.label);
    expect(labels).toContain('Cost value');
    expect(labels).toContain('Retail value');
    expect(metrics.filter((metric) => metric.financial)).toHaveLength(2);
  });

  it('uses the same financial layout for an authorized staff terminal', () => {
    const labels = buildStockMovementMetrics(
      null,
      canViewStockMovementFinancials('GP2')
    ).map((metric) => metric.label);
    expect(labels).toEqual(expect.arrayContaining(['Units sold today', 'Cost value', 'Retail value']));
  });

  it('keeps protected values hidden until the eye control reveals them', () => {
    const costMetric = buildStockMovementMetrics(null, true).find((metric) => metric.label === 'Cost value');
    expect(costMetric).toBeDefined();
    expect(getStockMovementMetricDisplayValue(costMetric!, false)).toBe('Hidden');
    expect(String(getStockMovementMetricDisplayValue(costMetric!, true)).replace(/\s/g, ' ')).toBe('R 0');
  });
});
