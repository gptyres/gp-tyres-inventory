import React, { useEffect, useRef, useState } from 'react';
import {
  fetchSupplierSyncStatus,
  SupplierSyncJob,
  SupplierSyncStatusResponse,
  triggerSupplierSync
} from '../supplierSync';

interface SupplierSyncButtonProps {
  terminal: string;
  catalog: string;
  supplierLabel: string;
  visible: boolean;
  canTrigger: boolean;
  workerRequired?: boolean;
  onCompleted: (job: SupplierSyncJob) => void;
}

const isTerminalStatus = (status?: string) => (
  status === 'succeeded'
  || status === 'partial'
  || status === 'failed'
  || status === 'cancelled'
);

const formatTime = (value?: string | null) => {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
};

const formatCount = (value: number) => new Intl.NumberFormat('en-ZA').format(value);

const stageLabel: Record<string, string> = {
  queued: 'Queued',
  fetching: 'Fetching supplier stock',
  validating: 'Validating stock rows',
  publishing: 'Publishing live stock',
  completed: 'Complete',
  failed: 'Failed',
  cancelled: 'Cancelled'
};

export function SupplierSyncButton({
  terminal,
  catalog,
  supplierLabel,
  visible,
  canTrigger,
  workerRequired = true,
  onCompleted
}: SupplierSyncButtonProps) {
  const [status, setStatus] = useState<SupplierSyncStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const trackedJobId = useRef<string | null>(null);
  const notifiedJobId = useRef<string | null>(null);

  useEffect(() => {
    if (!visible) return undefined;

    let cancelled = false;
    setStatus(null);
    trackedJobId.current = null;
    const refresh = async () => {
      try {
        const next = await fetchSupplierSyncStatus(catalog);
        if (cancelled) return;
        setStatus(next);
        setError('');

        if (next.activeJob) trackedJobId.current = next.activeJob.id;
        const latest = next.latestJob;
        if (
          latest
          && trackedJobId.current === latest.id
          && notifiedJobId.current !== latest.id
          && isTerminalStatus(latest.status)
        ) {
          notifiedJobId.current = latest.id;
          onCompleted(latest);
        }
      } catch (refreshError) {
        if (!cancelled) {
          setError(refreshError instanceof Error ? refreshError.message : 'Supplier sync status is unavailable.');
        }
      }
    };

    void refresh();
    const interval = window.setInterval(refresh, 1_500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [visible, catalog, onCompleted]);

  if (!visible) return null;

  const activeJob = status?.activeJob;
  const latestJob = status?.latestJob;
  const workerOnline = Boolean(status?.worker.online);
  const isActive = activeJob?.status === 'queued' || activeJob?.status === 'running';
  const disabled = loading || isActive;

  let label = `Sync ${supplierLabel}`;
  if (loading || activeJob?.status === 'queued') label = 'Sync Queued';
  else if (activeJob?.status === 'running') {
    const completed = activeJob.suppliers_completed + activeJob.suppliers_failed + activeJob.suppliers_skipped;
    label = activeJob.suppliers_total > 0
      ? 'Syncing ' + completed + ' of ' + activeJob.suppliers_total
      : `Syncing ${activeJob.target_supplier || supplierLabel}`;
  }

  const handleClick = async () => {
    setLoading(true);
    setError('');
    try {
      const next = await triggerSupplierSync(terminal, catalog);
      setStatus(next);
      if (next.activeJob) trackedJobId.current = next.activeJob.id;
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Could not queue supplier sync.');
    } finally {
      setLoading(false);
    }
  };

  const resultSuppliers = latestJob?.result_summary?.suppliers || [];
  const progressCurrent = Math.max(0, activeJob?.progress_current || 0);
  const progressTotal = activeJob?.progress_total && activeJob.progress_total > 0
    ? activeJob.progress_total
    : null;
  const progressPercent = progressTotal
    ? Math.min(100, Math.round((progressCurrent / progressTotal) * 100))
    : null;
  const progressSupplier = activeJob?.target_supplier || supplierLabel;

  return (
    <div className="relative flex min-w-56 shrink-0 flex-col items-stretch gap-1 rounded border border-blue-400/20 bg-blue-950/20 p-2">
      {canTrigger && (
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          aria-busy={loading || isActive}
          className="inline-flex min-w-48 items-center justify-center rounded border border-blue-400/50 bg-blue-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-blue-900/20 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:border-gp-border disabled:bg-gp-panel disabled:text-gp-text-muted"
        >
          {(loading || activeJob?.status === 'running') && (
            <span className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          {label}
        </button>
      )}

      <div className="max-w-72 text-right text-[10px] text-gp-text-muted" aria-live="polite">
        {error || (
          activeJob?.result_summary?.currentSupplier
            ? 'Current: ' + activeJob.result_summary.currentSupplier
            : !workerRequired
              ? 'Manual document import'
              : !status
                ? 'Checking sync worker status…'
              : workerOnline
              ? 'Worker online'
              : 'Worker offline · queued sync will start automatically.'
        )}
      </div>
      <p className="text-right text-[10px] font-bold text-blue-200">
        Last successful sync: {status?.lastSuccessfulSync
          ? formatTime(status.lastSuccessfulSync.at)
          : 'Never synced'}
        {status?.lastSuccessfulSync && ` · ${formatCount(status.lastSuccessfulSync.rowCount)} rows`}
      </p>

      {isActive && activeJob && (
        <div
          className="w-64 rounded border border-blue-400/30 bg-blue-950/40 p-2 text-left shadow-lg"
          role="progressbar"
          aria-label={`${progressSupplier} stock sync progress`}
          aria-valuemin={0}
          aria-valuenow={progressPercent ?? undefined}
          aria-valuemax={progressPercent === null ? undefined : 100}
          aria-valuetext={progressTotal
            ? `${formatCount(progressCurrent)} of ${formatCount(progressTotal)} stock rows`
            : `${formatCount(progressCurrent)} stock rows found`}
        >
          <div className="mb-1 flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-wide text-blue-200">
            <span>{progressSupplier}</span>
            <span>{progressPercent === null ? 'Live' : `${progressPercent}%`}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gp-bg">
            <div
              className={`h-full rounded-full bg-blue-500 transition-[width] duration-500 ${progressPercent === null ? 'w-1/2 animate-pulse' : ''}`}
              style={progressPercent === null ? undefined : { width: `${progressPercent}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] font-bold text-gp-text-main">
            {stageLabel[activeJob.progress_stage] || 'Syncing stock'}
          </p>
          <p className="text-[10px] text-gp-text-muted">
            {activeJob.progress_message || (
              progressTotal
                ? `${formatCount(progressCurrent)} / ${formatCount(progressTotal)} stock rows`
                : `${formatCount(progressCurrent)} stock rows found so far`
            )}
          </p>
          {progressTotal && (
            <p className="text-[10px] text-blue-300">
              {formatCount(progressCurrent)} / {formatCount(progressTotal)} stock rows
            </p>
          )}
        </div>
      )}

      {latestJob && (
        <details className="text-right text-[10px] text-gp-text-muted">
          <summary className="cursor-pointer select-none hover:text-gp-text-main">
            Last sync: {latestJob.status}
          </summary>
          <div className="absolute right-0 z-30 mt-2 w-80 rounded border border-gp-border bg-gp-panel p-3 text-left shadow-2xl">
            <p className="font-bold uppercase text-gp-text-main">{latestJob.status}</p>
            <p>{formatTime(latestJob.completed_at || latestJob.requested_at)}</p>
            <p>{latestJob.rows_published} rows published</p>
            {latestJob.safe_error && <p className="mt-1 text-gp-red">{latestJob.safe_error}</p>}
            {resultSuppliers.length > 0 && (
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                {resultSuppliers.map((supplier) => (
                  <li key={supplier.supplier} className="border-t border-gp-border/50 pt-1">
                    <span className="font-bold text-gp-text-main">{supplier.supplier}</span>
                    {' — ' + supplier.status}
                    {supplier.rowsPublished !== undefined && ' (' + supplier.rowsPublished + ' rows)'}
                    {supplier.detail && <span className="block">{supplier.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
