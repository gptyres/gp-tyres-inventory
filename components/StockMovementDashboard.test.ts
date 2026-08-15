import { describe, expect, it } from 'vitest';
import { buildStockMovementMetrics } from './StockMovementDashboard';

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
});
