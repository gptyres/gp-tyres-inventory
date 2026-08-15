import React, { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarDays, ChevronLeft, ChevronRight, Eye, EyeOff, Search } from 'lucide-react';
import { fetchDailyStockMovementReport, fetchStockMovementSummary } from '../inventoryHistory';
import { createStockMovementReport } from '../stockMovementReport';
import type { StockMovementDay, StockMovementSummary } from '../types';
import { formatCurrency } from '../utils';
import { TERMINAL_STAFF_NAMES } from '../trainingProgress';
import { canViewStockMovementFinancials } from '../stockMovementAccess';
import gpLogo from '../assets/gp-tyres-logo-transparent.png';

interface StockMovementDashboardProps {
  currentUser: string;
  isAdmin: boolean;
  fullView?: boolean;
}

const getTodayKey = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

const shortDate = (value: string) => new Intl.DateTimeFormat('en-ZA', {
  timeZone: 'Africa/Johannesburg', day: '2-digit', month: 'short'
}).format(new Date(`${value}T12:00:00+02:00`));

const formatMovementTime = (value: string) => new Intl.DateTimeFormat('en-ZA', {
  timeZone: 'Africa/Johannesburg',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
}).format(new Date(value));

const movementLabels: Record<string, string> = {
  SALE: 'Sale',
  REFUND: 'Refund',
  RESERVE: 'Reserved',
  RESTOCK: 'Restock',
  EDIT: 'Edit',
  ADD: 'Added',
  DELETE: 'Deleted'
};

const movementTones: Record<string, string> = {
  SALE: 'border-red-500/40 bg-red-500/10 text-red-300',
  REFUND: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
  RESERVE: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  RESTOCK: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
  EDIT: 'border-slate-500/40 bg-slate-500/10 text-slate-300',
  ADD: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  DELETE: 'border-orange-500/40 bg-orange-500/10 text-orange-300'
};

const formatQuantityChange = (value: number) => value > 0 ? `+${value}` : String(value);

export interface StockMovementChartBucket {
  key: string;
  label: string;
  fullLabel: string;
  soldUnits: number;
  restockedUnits: number;
  dayCount: number;
}

const compactDate = (value: string) => new Intl.DateTimeFormat('en-ZA', {
  timeZone: 'Africa/Johannesburg', day: '2-digit', month: 'short'
}).format(new Date(`${value}T12:00:00+02:00`));

export const buildStockMovementChartBuckets = (
  daily: StockMovementDay[],
  selectedDays: number
): StockMovementChartBucket[] => {
  const bucketSize = selectedDays >= 30 ? 5 : 1;
  const buckets: StockMovementChartBucket[] = [];
  for (let index = 0; index < daily.length; index += bucketSize) {
    const group = daily.slice(index, index + bucketSize);
    if (!group.length) continue;
    const first = group[0];
    const last = group[group.length - 1];
    const soldUnits = group.reduce((total, day) => total + day.soldUnits, 0);
    const restockedUnits = group.reduce((total, day) => total + day.restockedUnits, 0);
    const firstDate = compactDate(first.date);
    const lastDate = compactDate(last.date);
    const [firstDay, firstMonth] = firstDate.split(' ');
    const [lastDay, lastMonth] = lastDate.split(' ');
    const rangeLabel = group.length === 1
      ? firstDate
      : firstMonth === lastMonth ? `${firstDay}-${lastDay} ${lastMonth}` : `${firstDate}-${lastDate}`;
    buckets.push({
      key: `${first.date}-${last.date}`,
      label: rangeLabel,
      fullLabel: group.length === 1 ? firstDate : `${firstDate} to ${lastDate}`,
      soldUnits,
      restockedUnits,
      dayCount: group.length
    });
  }
  return buckets;
};

export interface StockMovementMetric {
  label: string;
  value: string | number;
  tone: string;
  caption: string;
  financial?: boolean;
}

export const getStockMovementMetricDisplayValue = (
  metric: StockMovementMetric,
  financialValuesVisible: boolean
) => metric.financial && !financialValuesVisible ? 'Hidden' : metric.value;

export const buildStockMovementMetrics = (
  summary: StockMovementSummary | null,
  showFinancials: boolean,
  selectedDays = summary?.days || 1
): StockMovementMetric[] => {
  const caption = selectedDays === 1 ? 'Today' : `${selectedDays}-day total`;
  const operational = [
    { label: 'Units sold', value: summary?.soldUnits ?? 0, tone: 'text-gp-red', caption },
    { label: 'Products sold', value: summary?.uniqueProducts ?? 0, tone: 'text-white', caption },
    { label: 'Restocked', value: summary?.restockedUnits ?? 0, tone: 'text-blue-300', caption },
    { label: 'Edits', value: summary?.editCount ?? 0, tone: 'text-slate-200', caption }
  ];
  if (!showFinancials) return operational;
  return [
    ...operational.slice(0, 2),
    { label: 'Cost value', value: formatCurrency(summary?.costValue ?? 0), tone: 'text-amber-300', caption, financial: true },
    { label: 'Retail value', value: formatCurrency(summary?.retailValue ?? 0), tone: 'text-emerald-300', caption, financial: true },
    ...operational.slice(2)
  ];
};

export const StockMovementDashboard: React.FC<StockMovementDashboardProps> = ({ currentUser, isAdmin, fullView = false }) => {
  const [days, setDays] = useState(1);
  const [summary, setSummary] = useState<StockMovementSummary | null>(null);
  const [reportDate, setReportDate] = useState(getTodayKey);
  const [loading, setLoading] = useState(true);
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState('');
  const [financialValuesVisible, setFinancialValuesVisible] = useState(false);
  const [movementQuery, setMovementQuery] = useState('');
  const [movementType, setMovementType] = useState('ALL');
  const [movementPage, setMovementPage] = useState(1);
  const showFinancials = canViewStockMovementFinancials(currentUser, isAdmin);

  useEffect(() => {
    setFinancialValuesVisible(false);
  }, [currentUser, isAdmin]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async (quiet = false) => {
      if (!quiet) {
        setLoading(true);
        setSummary(null);
      }
      try {
        const next = await fetchStockMovementSummary(days);
        if (!cancelled) {
          setSummary(next);
          setError('');
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Stock movement is unavailable.');
      } finally {
        if (!cancelled && !quiet) setLoading(false);
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(true), 60000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [days, showFinancials]);

  const maxProductUnits = useMemo(() => Math.max(1, ...(summary?.topItems.map((item) => item.units) || [1])), [summary]);
  const maxTyreUnits = useMemo(() => Math.max(1, ...(summary?.topTyres.map((item) => item.units) || [1])), [summary]);
  const activeDays = useMemo(() => summary?.daily.filter((day) => day.soldUnits > 0 || day.restockedUnits > 0).length || 0, [summary]);
  const peakSalesDay = useMemo(() => (summary?.daily || []).reduce((peak, day) => (
    day.soldUnits > peak.soldUnits ? day : peak
  ), { date: '', soldUnits: 0 }), [summary]);
  const chartBuckets = useMemo(() => buildStockMovementChartBuckets(summary?.daily || [], days), [days, summary]);
  const maxChartUnits = useMemo(() => Math.max(1, ...chartBuckets.map((bucket) => Math.max(bucket.soldUnits, bucket.restockedUnits))), [chartBuckets]);
  const averageSold = summary?.daily.length ? (summary.soldUnits / summary.daily.length).toFixed(1) : '0.0';
  const netStockFlow = (summary?.restockedUnits || 0) + (summary?.refundUnits || 0) - (summary?.soldUnits || 0);
  const movementVolume = (summary?.soldUnits || 0) + (summary?.restockedUnits || 0);
  const soldShare = movementVolume ? (summary?.soldUnits || 0) / movementVolume * 100 : 0;
  const chartDensityLabel = days >= 30 ? 'Grouped into five-day blocks' : 'Daily movement';
  const filteredMovements = useMemo(() => {
    const normalizedQuery = movementQuery.trim().toUpperCase();
    return (summary?.movements || []).filter((movement) => {
      if (movementType !== 'ALL' && movement.eventType !== movementType) return false;
      if (!normalizedQuery) return true;
      return [
        movement.productDescription,
        movement.productType,
        movement.location,
        movement.actor,
        movement.terminalOrSheet,
        movement.source
      ].some((value) => value.toUpperCase().includes(normalizedQuery));
    });
  }, [movementQuery, movementType, summary]);
  const movementPageSize = 25;
  const movementPageCount = Math.max(1, Math.ceil(filteredMovements.length / movementPageSize));
  const visibleMovements = useMemo(() => (
    filteredMovements.slice((movementPage - 1) * movementPageSize, movementPage * movementPageSize)
  ), [filteredMovements, movementPage]);

  useEffect(() => {
    setMovementPage(1);
  }, [days, movementQuery, movementType]);

  useEffect(() => {
    setMovementPage((current) => Math.min(current, movementPageCount));
  }, [movementPageCount]);

  const downloadReport = async () => {
    if (reporting) return;
    setReporting(true);
    setError('');
    try {
      const rows = await fetchDailyStockMovementReport(reportDate);
      const { doc, fileName } = await createStockMovementReport({
        rows,
        date: reportDate,
        generatedBy: TERMINAL_STAFF_NAMES[currentUser] || currentUser,
        terminalId: currentUser,
        logoUrl: gpLogo
      });
      doc.save(fileName);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The daily report could not be created.');
    } finally {
      setReporting(false);
    }
  };

  const metrics = buildStockMovementMetrics(summary, showFinancials, days);

  return (
    <section aria-labelledby="stock-movement-heading" className={fullView ? 'min-h-full' : undefined}>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="stock-movement-heading" className={fullView ? 'text-2xl font-black uppercase text-white' : 'text-sm font-bold uppercase tracking-widest text-gp-text-muted'}>
            {fullView ? 'Stock Movement Dashboard' : 'Stock Movement'}
          </h2>
          <p className="mt-1 text-sm text-gp-text-muted">Sales, restocks and verified portal or reconstructed Google Sheet changes in South African time.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex h-10 rounded-md border border-gp-border bg-gp-panel p-1">
            {[1, 5, 15, 30].map((option) => <button key={option} type="button" onClick={() => setDays(option)} aria-pressed={days === option} className={`min-w-12 rounded px-2 text-[10px] font-black uppercase ${days === option ? 'bg-gp-red text-white' : 'text-gp-text-muted hover:text-white'}`}>{option === 1 ? '1 Day' : `${option}D`}</button>)}
          </div>
          <input type="date" value={reportDate} max={getTodayKey()} onChange={(event) => setReportDate(event.target.value)} className="h-10 rounded-md border border-gp-border bg-gp-input px-3 text-xs font-bold text-white focus:border-gp-red focus:outline-none" aria-label="Daily stock report date" />
          <button type="button" onClick={() => void downloadReport()} disabled={reporting} className="inline-flex h-10 items-center gap-2 rounded-md bg-gp-red px-4 text-xs font-black uppercase tracking-wider text-white transition hover:bg-red-700 disabled:opacity-50">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0-3-3m3 3 3-3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            {reporting ? 'Building PDF...' : 'Daily PDF'}
          </button>
        </div>
      </div>

      {error ? <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300">{error}</div> : null}
      <div className={days === 1
        ? `grid grid-cols-2 gap-3 ${showFinancials ? 'lg:grid-cols-3 xl:grid-cols-6' : 'lg:grid-cols-4'}`
        : `grid grid-cols-2 overflow-hidden rounded-lg border border-gp-border bg-gp-panel ${showFinancials ? 'lg:grid-cols-3 xl:grid-cols-6' : 'lg:grid-cols-4'}`
      } aria-busy={loading}>
        {metrics.map((metric, index) => (
          <div
            key={metric.label}
            className={days === 1
              ? 'min-w-0 rounded-lg border border-gp-border bg-gp-panel p-3.5'
              : `min-w-0 border-b border-r border-gp-border p-4 ${index === 0 ? 'bg-gp-black' : 'bg-gp-panel'}`
            }
          >
            <div className="flex min-h-8 items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-wider text-gp-text-muted">{metric.label}</p>
                <p className="mt-0.5 text-[8px] font-bold uppercase text-gp-text-muted">{metric.caption}</p>
              </div>
              {metric.financial ? (
                <button
                  type="button"
                  onClick={() => setFinancialValuesVisible((visible) => !visible)}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-gp-border bg-gp-black text-gp-text-muted transition-all duration-300 hover:border-gp-red hover:text-white active:scale-90"
                  aria-label={financialValuesVisible ? 'Hide financial values' : 'Show financial values'}
                  title={financialValuesVisible ? 'Hide financial values' : 'Show financial values'}
                >
                  {financialValuesVisible ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
                </button>
              ) : null}
            </div>
            {loading ? (
              <span className="mt-2 block h-7 w-20 animate-pulse rounded-sm bg-slate-700/70" aria-label="Loading value" />
            ) : (
              <p
                key={`${metric.label}-${financialValuesVisible}-${days}`}
                className={`stock-movement-enter mt-1 truncate font-mono text-2xl font-black ${metric.financial && !financialValuesVisible ? 'text-gp-text-muted' : metric.tone}`}
                aria-live={metric.financial ? 'polite' : undefined}
              >
                {getStockMovementMetricDisplayValue(metric, financialValuesVisible)}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        <div className="overflow-hidden rounded-lg border border-gp-border bg-gp-panel">
          {days === 1 ? (
            <>
              <div className="flex flex-col gap-4 border-b border-gp-border bg-gp-black p-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-gp-text-muted">Sales pulse</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <strong className="font-mono text-4xl font-black text-gp-red">{summary?.soldUnits ?? 0}</strong>
                    <span className="text-xs font-black uppercase text-white">units sold</span>
                  </div>
                  <p className="mt-1 text-[10px] font-bold text-gp-text-muted">Today since opening</p>
                </div>
                <div className="flex gap-5">
                  <div><p className="text-[8px] font-black uppercase text-gp-text-muted">Restocked</p><p className="mt-1 font-mono text-lg font-black text-blue-300">{summary?.restockedUnits ?? 0}</p></div>
                  <div><p className="text-[8px] font-black uppercase text-gp-text-muted">Products</p><p className="mt-1 font-mono text-lg font-black text-white">{summary?.uniqueProducts ?? 0}</p></div>
                </div>
              </div>
              <div className="p-4">
                <div className="mb-4 flex h-2 overflow-hidden rounded-sm bg-slate-800" aria-hidden="true">
                  <div className="bg-gp-red transition-[width] duration-500 ease-out" style={{ width: `${(summary?.soldUnits || 0) + (summary?.restockedUnits || 0) ? (summary?.soldUnits || 0) / ((summary?.soldUnits || 0) + (summary?.restockedUnits || 0)) * 100 : 0}%` }} />
                  <div className="bg-blue-500 transition-[width] duration-500 ease-out" style={{ width: `${(summary?.soldUnits || 0) + (summary?.restockedUnits || 0) ? (summary?.restockedUnits || 0) / ((summary?.soldUnits || 0) + (summary?.restockedUnits || 0)) * 100 : 0}%` }} />
                </div>
                <div className="space-y-3" role="img" aria-label="Units sold today by product">
                {(summary?.topItems || []).slice(0, 7).length ? summary?.topItems.slice(0, 7).map((item, index) => (
                  <div key={item.productId} className="grid animate-fade-in-up grid-cols-[minmax(0,1fr)_auto] items-center gap-3" style={{ animationDelay: `${Math.min(index * 30, 150)}ms` }}>
                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-bold uppercase text-white" title={item.description}>{item.description}</p>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-sm bg-gp-black">
                        <div className="h-full bg-gp-red transition-[width] duration-500 ease-out" style={{ width: `${Math.max(5, item.units / maxProductUnits * 100)}%` }} />
                      </div>
                    </div>
                    <span className="min-w-8 text-right font-mono text-sm font-black text-gp-red">{item.units}</span>
                  </div>
                )) : <p className="py-14 text-center text-xs font-bold text-gp-text-muted">No sales recorded since opening today.</p>}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-5 border-b border-gp-border bg-gp-black p-4 sm:p-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-gp-text-muted">
                    <Activity className="h-3.5 w-3.5 text-gp-red" aria-hidden="true" />
                    {days}-day sales activity
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    {loading ? <span className="block h-12 w-24 animate-pulse rounded-sm bg-slate-700/70" aria-label="Loading sales total" /> : <strong className="stock-movement-enter font-mono text-4xl font-black text-gp-red sm:text-5xl">{summary?.soldUnits ?? 0}</strong>}
                    <span className="text-xs font-black uppercase text-white">units sold</span>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-gp-text-muted">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    {summary?.daily.length ? `${shortDate(summary.daily[0].date)} to ${shortDate(summary.daily[summary.daily.length - 1].date)}` : 'Selected period'}
                  </p>
                </div>
                <dl className="grid grid-cols-3 gap-5 sm:gap-8">
                  <div><dt className="text-[8px] font-black uppercase text-gp-text-muted">Average / day</dt><dd className="mt-1 font-mono text-lg font-black text-white">{loading ? '-' : averageSold}</dd></div>
                  <div><dt className="text-[8px] font-black uppercase text-gp-text-muted">Active days</dt><dd className="mt-1 font-mono text-lg font-black text-white">{loading ? '-' : activeDays}<span className="ml-1 text-[9px] text-gp-text-muted">/{days}</span></dd></div>
                  <div><dt className="text-[8px] font-black uppercase text-gp-text-muted">Peak day</dt><dd className="mt-1 font-mono text-lg font-black text-gp-red">{loading ? '-' : peakSalesDay.soldUnits}</dd><dd className="mt-0.5 text-[8px] font-bold uppercase text-gp-text-muted">{loading ? 'Loading' : peakSalesDay.date ? shortDate(peakSalesDay.date) : 'No sales'}</dd></div>
                </dl>
              </div>
              <div key={`chart-${days}`} className="stock-movement-enter p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase text-white">Movement trend</p>
                    <p className="mt-0.5 text-[9px] font-bold text-gp-text-muted">{chartDensityLabel}</p>
                  </div>
                  <div className="flex items-center gap-4 text-[9px] font-black uppercase text-gp-text-muted" role="list" aria-label="Chart legend">
                    <span className="inline-flex items-center gap-1.5" role="listitem"><span className="h-2.5 w-2.5 rounded-sm bg-gp-red" />Sold</span>
                    <span className="inline-flex items-center gap-1.5" role="listitem"><span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />Restocked</span>
                  </div>
                </div>
                {!loading && movementVolume === 0 ? (
                  <div className="flex h-56 flex-col items-center justify-center border-y border-gp-border px-4 text-center">
                    <Activity className="h-7 w-7 text-gp-text-muted" aria-hidden="true" />
                    <p className="mt-3 text-xs font-black uppercase text-white">No movement recorded</p>
                    <p className="mt-1 max-w-sm text-[10px] font-bold text-gp-text-muted">Sales and restocks for this period will appear here as they are recorded.</p>
                  </div>
                ) : <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2">
                  <div className="flex h-56 flex-col justify-between pb-7 text-right font-mono text-[8px] font-bold text-gp-text-muted" aria-hidden="true">
                    <span>{maxChartUnits}</span>
                    <span>{Math.round(maxChartUnits / 2)}</span>
                    <span>0</span>
                  </div>
                  <div className="relative h-56 border-b border-gp-border pb-7" role="group" aria-label={`${days} day units sold and restocked chart`}>
                    <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-slate-700/50" />
                    <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-slate-700/50" />
                    <div className="relative grid h-full items-end gap-1 sm:gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(chartBuckets.length, 1)}, minmax(0, 1fr))` }}>
                      {chartBuckets.map((bucket, index) => {
                        const soldHeight = bucket.soldUnits ? Math.max(4, bucket.soldUnits / maxChartUnits * 100) : 0;
                        const restockedHeight = bucket.restockedUnits ? Math.max(4, bucket.restockedUnits / maxChartUnits * 100) : 0;
                        const showSoldValue = days === 5 || days >= 30 || bucket.soldUnits === peakSalesDay.soldUnits;
                        return (
                          <button
                            key={bucket.key}
                            type="button"
                            className="group relative flex h-full min-w-0 items-end justify-center gap-0.5 rounded-sm outline-none focus-visible:bg-white/5 sm:gap-1"
                            aria-label={`${bucket.fullLabel}: ${bucket.soldUnits} sold and ${bucket.restockedUnits} restocked`}
                          >
                            <span className="pointer-events-none absolute left-1/2 top-1 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded border border-gp-border bg-gp-black px-2 py-1.5 text-[9px] font-bold text-white group-hover:block group-focus-visible:block">
                              {bucket.soldUnits} sold / {bucket.restockedUnits} restocked
                            </span>
                            {showSoldValue && bucket.soldUnits ? <span className="absolute text-[8px] font-black text-white" style={{ bottom: `calc(${soldHeight}% + 3px)` }}>{bucket.soldUnits}</span> : null}
                            <span className={`stock-movement-bar bg-gp-red ${days === 5 ? 'w-4 sm:w-6' : days >= 30 ? 'w-3 sm:w-5' : 'w-2 sm:w-3'}`} style={{ height: `${soldHeight}%`, transitionDelay: `${Math.min(index * 22, 180)}ms` }} />
                            <span className={`stock-movement-bar bg-blue-500 ${days === 5 ? 'w-4 sm:w-6' : days >= 30 ? 'w-3 sm:w-5' : 'w-2 sm:w-3'}`} style={{ height: `${restockedHeight}%`, transitionDelay: `${Math.min(index * 22 + 40, 220)}ms` }} />
                            {(days !== 15 || index % 3 === 0 || index === chartBuckets.length - 1) ? <span className={`absolute -bottom-5 whitespace-nowrap text-[8px] font-bold text-gp-text-muted ${index === 0 ? 'left-0' : index === chartBuckets.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}>{bucket.label}</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>}
                {movementVolume > 0 ? <div className="mt-5 flex flex-col gap-3 border-t border-gp-border pt-4 sm:flex-row sm:items-center">
                  <div className="flex items-center justify-between gap-4 sm:w-48">
                    <span className="text-[9px] font-black uppercase text-gp-text-muted">Net stock flow</span>
                    <span className={`font-mono text-xs font-black ${netStockFlow >= 0 ? 'text-blue-300' : 'text-gp-red'}`}>{netStockFlow > 0 ? '+' : ''}{netStockFlow}</span>
                  </div>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="whitespace-nowrap text-[8px] font-black uppercase text-gp-text-muted">Sold <strong className="ml-1 font-mono text-[10px] text-gp-red">{summary?.soldUnits ?? 0}</strong></span>
                    <div className="flex h-2 min-w-20 flex-1 overflow-hidden rounded-sm bg-slate-800" aria-hidden="true">
                      <span className="stock-movement-bar bg-gp-red" style={{ width: `${soldShare}%` }} />
                      <span className="stock-movement-bar bg-blue-500" style={{ width: `${100 - soldShare}%` }} />
                    </div>
                    <span className="whitespace-nowrap text-[8px] font-black uppercase text-gp-text-muted">Restocked <strong className="ml-1 font-mono text-[10px] text-blue-300">{summary?.restockedUnits ?? 0}</strong></span>
                  </div>
                </div> : null}
              </div>
            </>
          )}
        </div>
        <div className="rounded-lg border border-gp-border bg-gp-panel p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-white">Top 10 tyres sold</p>
            <span className="text-[9px] font-black uppercase text-gp-text-muted">{days === 1 ? 'Today' : `${days} days`}</span>
          </div>
          <div className="mt-3 space-y-2">
            {(summary?.topTyres || []).length ? summary?.topTyres.slice(0, fullView ? 10 : 6).map((item, index) => (
              <div
                key={`${item.productId}-${item.description}`}
                className="animate-fade-in-up border-b border-gp-border pb-2 last:border-0"
                style={{ animationDelay: `${Math.min(index * 35, 180)}ms` }}
              >
                <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-black text-gp-red">{String(index + 1).padStart(2, '0')}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold uppercase text-white" title={item.description}>{item.description}</p>
                    <p className="mt-0.5 truncate text-[9px] font-bold uppercase text-gp-text-muted" title={item.location}>{item.location || 'Location not recorded'}</p>
                  </div>
                <span className="font-mono text-sm font-black text-emerald-300">{item.units}</span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-sm bg-gp-black">
                  <div className="h-full bg-gp-red transition-[width] duration-700 ease-out" style={{ width: `${Math.max(4, item.units / maxTyreUnits * 100)}%` }} />
                </div>
              </div>
            )) : <p className="py-10 text-center text-xs font-bold text-gp-text-muted">No recorded sales in this period.</p>}
          </div>
        </div>
      </div>

      {fullView ? (
        <div className="mt-3 overflow-hidden rounded-lg border border-gp-border bg-gp-panel">
          <div className="flex flex-col gap-3 border-b border-gp-border p-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-white">All stock movements</p>
              <p className="mt-1 text-xs text-gp-text-muted">
                {filteredMovements.length} {filteredMovements.length === 1 ? 'movement' : 'movements'} in the selected {days === 1 ? 'day' : `${days} days`}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative min-w-0 sm:w-72">
                <span className="sr-only">Search stock movements</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gp-text-muted" aria-hidden="true" />
                <input
                  value={movementQuery}
                  onChange={(event) => setMovementQuery(event.target.value)}
                  placeholder="Search product, location or staff"
                  className="h-10 w-full rounded-md border border-gp-border bg-gp-input pl-9 pr-3 text-xs font-bold text-white outline-none transition focus:border-gp-red"
                />
              </label>
              <select
                value={movementType}
                onChange={(event) => setMovementType(event.target.value)}
                className="h-10 rounded-md border border-gp-border bg-gp-input px-3 text-xs font-black uppercase text-white outline-none transition focus:border-gp-red"
                aria-label="Filter stock movements by type"
              >
                <option value="ALL">All movements</option>
                {Object.entries(movementLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1040px] border-collapse text-left">
              <thead className="bg-gp-black text-[9px] font-black uppercase text-gp-text-muted">
                <tr>
                  <th className="px-4 py-3">Date / Time</th>
                  <th className="px-3 py-3">Movement</th>
                  <th className="px-3 py-3">Product</th>
                  <th className="px-3 py-3">Location</th>
                  <th className="px-3 py-3 text-right">Change</th>
                  <th className="px-3 py-3">Stock</th>
                  <th className="px-3 py-3">Source</th>
                  <th className="px-4 py-3">Staff / Terminal</th>
                </tr>
              </thead>
              <tbody>
                {visibleMovements.map((movement, index) => (
                  <tr
                    key={movement.id}
                    className="animate-fade-in-up border-t border-gp-border text-xs transition-colors duration-200 hover:bg-white/[0.025]"
                    style={{ animationDelay: `${Math.min(index * 18, 160)}ms` }}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-gp-text-muted">{formatMovementTime(movement.occurredAt)}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded border px-2 py-1 text-[9px] font-black uppercase ${movementTones[movement.eventType] || movementTones.EDIT}`}>
                        {movementLabels[movement.eventType] || movement.eventType}
                      </span>
                    </td>
                    <td className="max-w-sm px-3 py-3">
                      <p className="font-bold uppercase text-white">{movement.productDescription}</p>
                      <p className="mt-0.5 text-[9px] font-black uppercase text-gp-text-muted">{movement.productType}</p>
                    </td>
                    <td className="px-3 py-3 font-bold text-slate-200">{movement.location}</td>
                    <td className={`px-3 py-3 text-right font-mono text-sm font-black ${movement.quantityDelta < 0 ? 'text-gp-red' : movement.quantityDelta > 0 ? 'text-emerald-300' : 'text-gp-text-muted'}`}>
                      {formatQuantityChange(movement.quantityDelta)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-[11px] text-slate-200">{movement.quantityBefore ?? '-'} → {movement.quantityAfter ?? '-'}</td>
                    <td className="px-3 py-3 text-[10px] font-bold uppercase text-gp-text-muted">{movement.source.replaceAll('_', ' ')}</td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-white">{movement.actor}</p>
                      <p className="mt-0.5 text-[9px] uppercase text-gp-text-muted">{movement.terminalOrSheet}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-gp-border md:hidden">
            {visibleMovements.map((movement, index) => (
              <article
                key={movement.id}
                className="animate-fade-in-up p-4"
                style={{ animationDelay: `${Math.min(index * 18, 160)}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold uppercase text-white">{movement.productDescription}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase text-gp-text-muted">{movement.productType} · {movement.location}</p>
                  </div>
                  <span className={`shrink-0 rounded border px-2 py-1 text-[9px] font-black uppercase ${movementTones[movement.eventType] || movementTones.EDIT}`}>
                    {movementLabels[movement.eventType] || movement.eventType}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-gp-border bg-gp-black p-3">
                  <div><p className="text-[8px] font-black uppercase text-gp-text-muted">Change</p><p className={`mt-1 font-mono text-sm font-black ${movement.quantityDelta < 0 ? 'text-gp-red' : movement.quantityDelta > 0 ? 'text-emerald-300' : 'text-gp-text-muted'}`}>{formatQuantityChange(movement.quantityDelta)}</p></div>
                  <div><p className="text-[8px] font-black uppercase text-gp-text-muted">Stock</p><p className="mt-1 font-mono text-sm font-black text-white">{movement.quantityBefore ?? '-'} → {movement.quantityAfter ?? '-'}</p></div>
                  <div><p className="text-[8px] font-black uppercase text-gp-text-muted">Recorded</p><p className="mt-1 text-[10px] font-bold text-white">{formatMovementTime(movement.occurredAt)}</p></div>
                  <div><p className="text-[8px] font-black uppercase text-gp-text-muted">Staff / source</p><p className="mt-1 text-[10px] font-bold text-white">{movement.actor} · {movement.source.replaceAll('_', ' ')}</p></div>
                </div>
              </article>
            ))}
          </div>

          {!visibleMovements.length ? <p className="px-4 py-16 text-center text-xs font-bold text-gp-text-muted">No stock movements match these filters.</p> : null}

          {filteredMovements.length > movementPageSize ? (
            <div className="flex items-center justify-between gap-3 border-t border-gp-border bg-gp-black px-4 py-3">
              <p className="text-[10px] font-bold uppercase text-gp-text-muted">Page {movementPage} of {movementPageCount}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setMovementPage((page) => Math.max(1, page - 1))} disabled={movementPage === 1} className="inline-flex h-8 w-8 items-center justify-center rounded border border-gp-border text-gp-text-muted transition hover:border-gp-red hover:text-white disabled:opacity-30" aria-label="Previous movement page"><ChevronLeft className="h-4 w-4" /></button>
                <button type="button" onClick={() => setMovementPage((page) => Math.min(movementPageCount, page + 1))} disabled={movementPage === movementPageCount} className="inline-flex h-8 w-8 items-center justify-center rounded border border-gp-border text-gp-text-muted transition hover:border-gp-red hover:text-white disabled:opacity-30" aria-label="Next movement page"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
