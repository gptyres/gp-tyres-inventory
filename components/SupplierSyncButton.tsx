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
  onAdminRequired?: () => void;
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
  queued: 'Starting supplier sync',
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
  onAdminRequired,
  onCompleted
}: SupplierSyncButtonProps) {
  const [status, setStatus] = useState<SupplierSyncStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const trackedJobId = useRef<string | null>(null);
  const notifiedJobId = useRef<string | null>(null);

  useEffect(() => {
    if (!visible || !workerRequired) return undefined;

    let cancelled = false;
    setStatus(null);
    setIsPanelOpen(false);
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
  }, [visible, workerRequired, catalog, onCompleted]);

  const activeStatus = status?.activeJob?.status;

  useEffect(() => {
    if (activeStatus === 'queued' || activeStatus === 'running' || error) {
      setIsPanelOpen(true);
    }
  }, [activeStatus, error]);

  useEffect(() => {
    if (!isPanelOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsPanelOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsPanelOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPanelOpen]);

  if (!visible || !workerRequired) return null;

  const activeJob = status?.activeJob;
  const blockingJob = status?.blockingJob;
  const latestJob = status?.latestJob;
  const workerOnline = Boolean(status?.worker?.online);
  const isActive = activeJob?.status === 'queued' || activeJob?.status === 'running';
  const workerUnavailable = workerRequired && Boolean(status) && !workerOnline;
  const disabled = loading || isActive || Boolean(blockingJob) || workerUnavailable;

  let label = 'Sync Stock';
  if (loading || activeJob?.status === 'queued') label = 'Starting Sync...';
  else if (activeJob?.status === 'running') {
    label = 'Syncing Stock...';
  }
  else if (blockingJob) label = 'Sync In Progress';
  else if (workerUnavailable) label = 'Sync Offline';

  const handleSync = async () => {
    if (!canTrigger) {
      onAdminRequired?.();
      return;
    }
    setLoading(true);
    setError('');
    try {
      const next = await triggerSupplierSync(terminal, catalog);
      setStatus(next);
      if (next.activeJob) trackedJobId.current = next.activeJob.id;
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Could not start supplier sync.');
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
  const panelId = `supplier-sync-${catalog.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const statusMessage = error || (
    activeJob?.result_summary?.currentSupplier
      ? 'Current: ' + activeJob.result_summary.currentSupplier
      : !status
        ? 'Checking sync worker status...'
        : blockingJob
          ? `Another supplier is syncing: ${blockingJob.target_supplier || 'supplier'}`
          : workerOnline
            ? 'Ready to sync'
            : 'Sync worker offline. Restart the office sync service.'
  );
  const handlePanelToggle = () => {
    if (!canTrigger) {
      onAdminRequired?.();
      return;
    }
    setIsPanelOpen((open) => !open);
  };

  return (
    <div ref={menuRef} className="relative min-w-0 self-start">
      <button
        type="button"
        onClick={handlePanelToggle}
        aria-busy={loading || isActive}
        aria-expanded={isPanelOpen}
        aria-controls={panelId}
        aria-label={canTrigger ? `Show ${supplierLabel} sync details` : `Admin access required to view ${supplierLabel} sync`}
        title={canTrigger ? `Show ${supplierLabel} sync details` : 'Admin access required'}
        className="inline-flex h-11 w-full min-w-0 items-center justify-center whitespace-nowrap rounded-lg border border-blue-300/60 bg-blue-600 px-4 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-blue-900/20 transition hover:-translate-y-px hover:bg-blue-500 active:translate-y-0"
      >
        {(loading || isActive) && (
          <span className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        Sync Stock
        <span className={`ml-2 text-[10px] transition-transform ${isPanelOpen ? 'rotate-180' : ''}`} aria-hidden="true">▼</span>
      </button>

      <div
        id={panelId}
        hidden={!isPanelOpen}
        className="absolute left-1/2 top-[calc(100%+0.5rem)] z-40 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-blue-400/30 bg-gp-panel p-3 text-left shadow-2xl"
        role="region"
        aria-label={`${supplierLabel} sync status`}
        aria-live="polite"
      >
        <div className="flex items-start justify-between gap-3 border-b border-gp-border/70 pb-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-gp-text-main">Sync status</p>
            <p className={`mt-1 text-[10px] ${error ? 'text-gp-red' : 'text-gp-text-muted'}`}>{statusMessage}</p>
          </div>
          {latestJob && (
            <span className="shrink-0 text-[10px] font-bold uppercase text-blue-200">{latestJob.status}</span>
          )}
        </div>

        <p className="py-2 text-[10px] font-bold text-blue-200">
          Last successful sync: {status?.lastSuccessfulSync
            ? formatTime(status.lastSuccessfulSync.at)
            : 'Never synced'}
          {status?.lastSuccessfulSync && ` | ${formatCount(status.lastSuccessfulSync.rowCount)} rows`}
        </p>

        {isActive && activeJob && (
          <div
            className="mb-2 rounded-lg border border-blue-400/30 bg-blue-950/40 p-2 text-left"
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
          <details className="mb-2 border-t border-gp-border/70 pt-2 text-[10px] text-gp-text-muted">
            <summary className="cursor-pointer select-none font-bold hover:text-gp-text-main">
              Last sync details
            </summary>
            <div className="mt-2 space-y-1">
              <p>{formatTime(latestJob.completed_at || latestJob.requested_at)}</p>
              <p>{latestJob.rows_published} rows published</p>
              {latestJob.safe_error && <p className="text-gp-red">{latestJob.safe_error}</p>}
              {resultSuppliers.length > 0 && (
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                  {resultSuppliers.map((supplier) => (
                    <li key={supplier.supplier} className="border-t border-gp-border/50 pt-1">
                      <span className="font-bold text-gp-text-main">{supplier.supplier}</span>
                      {' - ' + supplier.status}
                      {supplier.rowsPublished !== undefined && ' (' + supplier.rowsPublished + ' rows)'}
                      {supplier.detail && <span className="block">{supplier.detail}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        )}

        <button
          type="button"
          onClick={handleSync}
          disabled={disabled}
          aria-busy={loading || isActive}
          aria-label={canTrigger ? `Start ${supplierLabel} stock sync` : `Admin access required to sync ${supplierLabel} stock`}
          title={canTrigger ? `Start ${supplierLabel} stock sync` : 'Admin access required'}
          className="inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-lg border border-blue-300/50 bg-blue-600 px-3 text-[11px] font-black uppercase tracking-wider text-white transition hover:bg-blue-500 active:-translate-y-px disabled:cursor-not-allowed disabled:border-gp-border disabled:bg-gp-bg disabled:text-gp-text-muted"
        >
          {label}
        </button>
      </div>
    </div>
  );
}
