import { describe, expect, it } from 'vitest';
import {
  buildStockMovementChartBuckets,
  buildStockMovementMetrics,
  getRollingStockMovementRange,
  getStockMovementMetricDisplayValue
} from './StockMovementDashboard';
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

  it('uses a clear caption for calendar-month ranges', () => {
    const metrics = buildStockMovementMetrics(summary({ days: 182 }), false, 182, '6-month total');
    expect(metrics.every((metric) => metric.caption === '6-month total')).toBe(true);
  });
});

describe('stock movement chart density', () => {
  const day = (date: string, soldUnits: number, restockedUnits: number) => ({
    date, soldUnits, restockedUnits, refundUnits: 0, reservedUnits: 0,
    editCount: 0, costValue: 0, retailValue: 0, reconstructedEvents: 0
  });

  it('keeps five and fifteen day views at daily detail', () => {
    const daily = [day('2026-08-11', 2, 1), day('2026-08-12', 4, 3)];
    expect(buildStockMovementChartBuckets(daily, 5)).toHaveLength(2);
    expect(buildStockMovementChartBuckets(daily, 15)[1]).toMatchObject({ soldUnits: 4, restockedUnits: 3, dayCount: 1 });
  });

  it('groups the thirty day chart into readable five-day blocks', () => {
    const daily = Array.from({ length: 10 }, (_, index) => day(
      `2026-08-${String(index + 1).padStart(2, '0')}`,
      index + 1,
      1
    ));
    const buckets = buildStockMovementChartBuckets(daily, 30);
    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toMatchObject({ label: '01-05 Aug', fullLabel: '01 Aug to 05 Aug', soldUnits: 15, restockedUnits: 5, dayCount: 5 });
    expect(buckets[1]).toMatchObject({ soldUnits: 40, restockedUnits: 5, dayCount: 5 });
  });

  it('groups six-month charts into readable two-week blocks', () => {
    const daily = Array.from({ length: 28 }, (_, index) => day(
      `2026-07-${String(index + 1).padStart(2, '0')}`,
      1,
      2
    ));
    const buckets = buildStockMovementChartBuckets(daily, 182);
    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toMatchObject({ soldUnits: 14, restockedUnits: 28, dayCount: 14 });
  });

  it('calculates rolling calendar-month ranges instead of fixed thirty-day months', () => {
    expect(getRollingStockMovementRange(3, '2026-08-17')).toEqual({
      from: '2026-05-17',
      to: '2026-08-17',
      days: 93
    });
    expect(getRollingStockMovementRange(6, '2026-08-17')).toEqual({
      from: '2026-02-17',
      to: '2026-08-17',
      days: 182
    });
  });
});
