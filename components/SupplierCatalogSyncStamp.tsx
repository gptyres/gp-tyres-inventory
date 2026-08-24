import React, { useEffect, useState } from 'react';
import { fetchSupplierSyncStatus, type SupplierSyncStatusResponse } from '../supplierSync';
import { isLiveSupplierCatalog } from '../supplierCatalogMapping';
import type { InventoryItem, SupplierCatalog } from '../types';

interface SupplierCatalogSyncStampProps {
  catalog: SupplierCatalog;
  fallbackSyncedAt?: string | null;
  refreshKey?: number;
}

const formatRowCount = (value: number) => new Intl.NumberFormat('en-ZA').format(value);

export const formatCatalogSyncTime = (value?: string | null) => {
  if (!value) return 'Never synced';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Sync date unavailable';
  const includesTime = /T\d{2}:\d{2}/i.test(value);
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    ...(includesTime ? { timeStyle: 'short' as const } : {}),
    timeZone: 'Africa/Johannesburg'
  }).format(parsed);
};

export const latestCatalogItemDate = (items: InventoryItem[]) => (
  items.reduce<string | null>((latest, item) => {
    const value = item.lastUpdated?.trim();
    if (!value) return latest;
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) return latest;
    if (!latest || timestamp > new Date(latest).getTime()) return value;
    return latest;
  }, null)
);

export function SupplierCatalogSyncStamp({
  catalog,
  fallbackSyncedAt,
  refreshKey = 0
}: SupplierCatalogSyncStampProps) {
  const [status, setStatus] = useState<SupplierSyncStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const hasLiveStatus = isLiveSupplierCatalog(catalog);

  useEffect(() => {
    if (!hasLiveStatus) {
      setStatus(null);
      setLoading(false);
      setFailed(false);
      return undefined;
    }

    let cancelled = false;
    setStatus(null);
    setLoading(true);
    setFailed(false);
    const refresh = async () => {
      try {
        const next = await fetchSupplierSyncStatus(catalog);
        if (!cancelled) {
          setStatus(next);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void refresh();
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [catalog, hasLiveStatus, refreshKey]);

  const liveSync = status?.lastSuccessfulSync;
  const syncedAt = liveSync?.at || fallbackSyncedAt || null;
  const label = loading && !syncedAt
    ? 'Checking sync date...'
    : formatCatalogSyncTime(syncedAt);

  return (
    <div
      className="flex min-h-10 w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-lg border border-gp-border bg-gp-panel px-3 py-2 text-center md:w-auto md:justify-end md:text-right"
      aria-live="polite"
      title={failed && !syncedAt ? 'The live sync date could not be loaded.' : undefined}
    >
      <span className="text-[10px] font-black uppercase tracking-wider text-gp-text-muted">
        Last synced
      </span>
      {syncedAt ? (
        <time className="text-xs font-bold text-gp-text-main" dateTime={syncedAt}>{label}</time>
      ) : (
        <span className={`text-xs font-bold ${failed ? 'text-gp-red' : 'text-gp-text-main'}`}>{label}</span>
      )}
      {liveSync && (
        <span className="text-[10px] font-bold text-blue-300">
          {formatRowCount(liveSync.rowCount)} rows
        </span>
      )}
    </div>
  );
}
