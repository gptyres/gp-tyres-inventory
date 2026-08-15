import { describe, expect, it } from 'vitest';
import { buildStockMovementMetrics, getStockMovementMetricDisplayValue } from './StockMovementDashboard';
import { canViewStockMovementFinancials } from '../stockMovementAccess';
import type { StockMovementSummary } from '../types';

const summary = (overrides: Partial<StockMovementSummary> = {}): StockMovementSummary => ({
  timezone: 'Africa/Johannesburg', days: 5, from: '', to: '',
  soldUnits: 18, refundUnits: 1, uniqueProducts: 7, costValue: 12_000,
  retailValue: 18_500, restockedUnits: 23, editCount: 4,
  soldUnitsToday: 2, refundUnitsToday: 0, uniqueProductsToday: 1,
  costValueToday: 1_200, retailValueToday: 1_850, restockedUnitsToday: 3,
  editCountToday: 1, daily: [], topItems: [], topTyres: [], movements: [],
  ...overrides
});

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
    expect(labels).toEqual(expect.arrayContaining(['Units sold', 'Cost value', 'Retail value']));
  });

  it('keeps protected values hidden until the eye control reveals them', () => {
    const costMetric = buildStockMovementMetrics(null, true).find((metric) => metric.label === 'Cost value');
    expect(costMetric).toBeDefined();
    expect(getStockMovementMetricDisplayValue(costMetric!, false)).toBe('Hidden');
    expect(String(getStockMovementMetricDisplayValue(costMetric!, true)).replace(/\s/g, ' ')).toBe('R 0');
  });

  it('uses totals from the selected timeframe instead of today-only values', () => {
    const metrics = buildStockMovementMetrics(summary(), true);
    expect(metrics.find((metric) => metric.label === 'Units sold')).toMatchObject({ value: 18, caption: '5-day total' });
    expect(metrics.find((metric) => metric.label === 'Products sold')?.value).toBe(7);
    expect(metrics.find((metric) => metric.label === 'Restocked')?.value).toBe(23);
    expect(metrics.find((metric) => metric.label === 'Edits')?.value).toBe(4);
    expect(String(metrics.find((metric) => metric.label === 'Retail value')?.value).replace(/\s/g, ' ')).toBe('R 18 500');
  });
});
