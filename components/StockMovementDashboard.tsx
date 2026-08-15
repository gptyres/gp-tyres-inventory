import React, { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { fetchDailyStockMovementReport, fetchStockMovementSummary } from '../inventoryHistory';
import { createStockMovementReport } from '../stockMovementReport';
import type { StockMovementSummary } from '../types';
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

export interface StockMovementMetric {
  label: string;
  value: string | number;
  tone: string;
  financial?: boolean;
}

export const getStockMovementMetricDisplayValue = (
  metric: StockMovementMetric,
  financialValuesVisible: boolean
) => metric.financial && !financialValuesVisible ? 'Hidden' : metric.value;

export const buildStockMovementMetrics = (summary: StockMovementSummary | null, showFinancials: boolean): StockMovementMetric[] => {
  const operational = [
    { label: 'Units sold today', value: summary?.soldUnitsToday ?? 0, tone: 'text-gp-red' },
    { label: 'Products sold', value: summary?.uniqueProductsToday ?? 0, tone: 'text-white' },
    { label: 'Restocked today', value: summary?.restockedUnitsToday ?? 0, tone: 'text-blue-300' },
    { label: 'Edits today', value: summary?.editCountToday ?? 0, tone: 'text-slate-200' }
  ];
  if (!showFinancials) return operational;
  return [
    ...operational.slice(0, 2),
    { label: 'Cost value', value: formatCurrency(summary?.costValueToday ?? 0), tone: 'text-amber-300', financial: true },
    { label: 'Retail value', value: formatCurrency(summary?.retailValueToday ?? 0), tone: 'text-emerald-300', financial: true },
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
  const showFinancials = canViewStockMovementFinancials(currentUser, isAdmin);

  useEffect(() => {
    setFinancialValuesVisible(false);
  }, [currentUser, isAdmin]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async (quiet = false) => {
      if (!quiet) setLoading(true);
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

  const maxUnits = useMemo(() => Math.max(1, ...(summary?.daily.map((day) => Math.max(day.soldUnits, day.restockedUnits)) || [1])), [summary]);
  const maxProductUnits = useMemo(() => Math.max(1, ...(summary?.topItems.map((item) => item.units) || [1])), [summary]);

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

  const metrics = buildStockMovementMetrics(summary, showFinancials);

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
            {[1, 5, 15, 30].map((option) => <button key={option} type="button" onClick={() => setDays(option)} className={`min-w-12 rounded px-2 text-[10px] font-black uppercase ${days === option ? 'bg-gp-red text-white' : 'text-gp-text-muted hover:text-white'}`}>{option === 1 ? '1 Day' : `${option}D`}</button>)}
          </div>
          <input type="date" value={reportDate} max={getTodayKey()} onChange={(event) => setReportDate(event.target.value)} className="h-10 rounded-md border border-gp-border bg-gp-input px-3 text-xs font-bold text-white focus:border-gp-red focus:outline-none" aria-label="Daily stock report date" />
          <button type="button" onClick={() => void downloadReport()} disabled={reporting} className="inline-flex h-10 items-center gap-2 rounded-md bg-gp-red px-4 text-xs font-black uppercase tracking-wider text-white transition hover:bg-red-700 disabled:opacity-50">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0-3-3m3 3 3-3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            {reporting ? 'Building PDF...' : 'Daily PDF'}
          </button>
        </div>
      </div>

      {error ? <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300">{error}</div> : null}
      <div className={`grid grid-cols-2 gap-3 ${showFinancials ? 'lg:grid-cols-3 xl:grid-cols-6' : 'lg:grid-cols-4'}`}>
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0 rounded-lg border border-gp-border bg-gp-panel p-3.5">
            <div className="flex min-h-7 items-start justify-between gap-2">
              <p className="pt-1 text-[9px] font-black uppercase tracking-wider text-gp-text-muted">{metric.label}</p>
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
            <p
              key={`${metric.label}-${financialValuesVisible}`}
              className={`mt-1 truncate font-mono text-2xl font-black animate-fade-in-up ${metric.financial && !financialValuesVisible ? 'text-gp-text-muted' : metric.tone}`}
              aria-live={metric.financial ? 'polite' : undefined}
            >
              {loading ? '-' : getStockMovementMetricDisplayValue(metric, financialValuesVisible)}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        <div className="rounded-lg border border-gp-border bg-gp-panel p-4">
          {days === 1 ? (
            <>
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-white">Products sold today</p>
                <span className="text-[9px] font-black uppercase text-gp-text-muted">Since opening</span>
              </div>
              <div className="space-y-3" role="img" aria-label="Units sold today by product">
                {(summary?.topItems || []).length ? summary?.topItems.map((item) => (
                  <div key={item.productId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-bold uppercase text-white" title={item.description}>{item.description}</p>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-sm bg-gp-black">
                        <div className="h-full bg-gp-red" style={{ width: `${Math.max(5, item.units / maxProductUnits * 100)}%` }} />
                      </div>
                    </div>
                    <span className="min-w-8 text-right font-mono text-sm font-black text-gp-red">{item.units}</span>
                  </div>
                )) : <p className="py-14 text-center text-xs font-bold text-gp-text-muted">No sales recorded since opening today.</p>}
              </div>
            </>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-white">Daily units</p>
                <div className="flex gap-3 text-[9px] font-black uppercase text-gp-text-muted"><span><i className="mr-1 inline-block h-2 w-2 bg-gp-red" />Sold</span><span><i className="mr-1 inline-block h-2 w-2 bg-blue-500" />Restocked</span></div>
              </div>
              <div className="flex h-48 items-end gap-1.5 overflow-x-auto border-b border-gp-border pb-6 sm:gap-2" role="img" aria-label={`${days} day units sold and restocked chart`}>
                {(summary?.daily || []).map((day) => (
                  <div key={day.date} className="group relative flex h-full min-w-8 flex-1 items-end justify-center gap-0.5" title={`${day.date}: ${day.soldUnits} sold, ${day.restockedUnits} restocked`}>
                    <div className="w-2.5 bg-gp-red transition-all sm:w-3" style={{ height: `${Math.max(day.soldUnits ? 4 : 0, day.soldUnits / maxUnits * 100)}%` }} />
                    <div className="w-2.5 bg-blue-500 transition-all sm:w-3" style={{ height: `${Math.max(day.restockedUnits ? 4 : 0, day.restockedUnits / maxUnits * 100)}%` }} />
                    <span className="absolute -bottom-5 whitespace-nowrap text-[8px] font-bold text-gp-text-muted">{shortDate(day.date)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="rounded-lg border border-gp-border bg-gp-panel p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-white">Top sold products</p>
          <div className="mt-3 space-y-2">
            {(summary?.topItems || []).length ? summary?.topItems.slice(0, fullView ? 8 : 6).map((item, index) => (
              <div key={item.productId} className="flex items-center gap-3 border-b border-gp-border pb-2 last:border-0">
                <span className="font-mono text-xs font-black text-gp-red">{String(index + 1).padStart(2, '0')}</span>
                <p className="min-w-0 flex-1 truncate text-xs font-bold uppercase text-white" title={item.description}>{item.description}</p>
                <span className="font-mono text-sm font-black text-emerald-300">{item.units}</span>
              </div>
            )) : <p className="py-10 text-center text-xs font-bold text-gp-text-muted">No recorded sales in this period.</p>}
          </div>
        </div>
      </div>
    </section>
  );
};
