import React, { useEffect, useState } from 'react';
import {
  fetchLatestSheetInventorySyncRun,
  SheetInventorySyncRun,
  subscribeToSheetInventorySyncRuns
} from '../sheetInventoryStatus';

interface SheetInventorySyncStatusProps {
  visible: boolean;
}

const formatSyncTime = (value?: string | null) => {
  if (!value) return 'Not synced yet';
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
};

const getStatusClass = (status?: string) => {
  if (status === 'completed') return 'text-green-400';
  if (status === 'failed') return 'text-gp-red';
  if (status === 'started') return 'text-yellow-400';
  return 'text-gp-text-muted';
};

export const SheetInventorySyncStatus: React.FC<SheetInventorySyncStatusProps> = ({ visible }) => {
  const [syncRun, setSyncRun] = useState<SheetInventorySyncRun | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    if (!visible) return;
    setIsLoading(true);
    setError('');

    try {
      setSyncRun(await fetchLatestSheetInventorySyncRun());
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Could not load Google Sheet sync status.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [visible]);

  useEffect(() => {
    if (!visible) return undefined;
    return subscribeToSheetInventorySyncRuns(
      () => void refresh(),
      () => setError('Live sync status paused. Use refresh to check again.')
    );
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="mx-auto mt-4 max-w-7xl px-4">
      <div className="flex flex-col gap-3 rounded-lg border border-gp-border bg-gp-panel p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gp-border bg-gp-black text-gp-red">
            <span className="text-xs font-black">GS</span>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-gp-text-muted">Google Sheet Sync</p>
            <p className={`mt-1 text-sm font-black uppercase tracking-wide ${getStatusClass(syncRun?.status)}`}>
              {syncRun?.status ?? 'No sync recorded'}
            </p>
            <p className="mt-1 text-xs text-gp-text-muted">
              Last sync: {formatSyncTime(syncRun?.completed_at ?? syncRun?.started_at)}
            </p>
            {error && <p className="mt-1 text-xs font-bold text-gp-red">{error}</p>}
            {syncRun?.error_message && <p className="mt-1 text-xs font-bold text-gp-red">{syncRun.error_message}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-gp-text-muted">
          <span className="rounded border border-gp-border bg-gp-black px-3 py-2">Rows {syncRun?.rows_received ?? 0}</span>
          <span className="rounded border border-gp-border bg-gp-black px-3 py-2 text-green-400">Updated {syncRun?.rows_upserted ?? 0}</span>
          <span className="rounded border border-gp-border bg-gp-black px-3 py-2">Skipped {syncRun?.rows_skipped ?? 0}</span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded bg-gp-red px-3 py-2 font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </div>
    </div>
  );
};
