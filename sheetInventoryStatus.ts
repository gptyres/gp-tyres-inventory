import { supabase } from './supabaseClient';
import { InventoryItem } from './types';
import { buildSheetPortalItemPayloads, SheetPortalSyncOperation } from './sheetInventoryBridge';

export interface SheetInventorySyncRun {
  id: string;
  status: string;
  sync_mode: string;
  dry_run: boolean;
  rows_received: number;
  rows_parsed: number;
  rows_upserted: number;
  rows_skipped: number;
  rows_failed: number;
  error_message?: string | null;
  started_at: string;
  completed_at?: string | null;
}

export const fetchLatestSheetInventorySyncRun = async (): Promise<SheetInventorySyncRun | null> => {
  const { data, error } = await (supabase.from('sheet_inventory_sync_runs') as any)
    .select('id,status,sync_mode,dry_run,rows_received,rows_parsed,rows_upserted,rows_skipped,rows_failed,error_message,started_at,completed_at')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as SheetInventorySyncRun | null;
};

export const triggerSheetInventorySyncNow = async () => {
  const { data, error } = await (supabase.functions.invoke as any)('sync-sheet-inventory-now', {
    body: {
      requestedBy: 'portal'
    }
  });

  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error || 'Google Sheet sync failed.');
  return data;
};

export const syncPortalInventoryItemsToSheet = async (
  items: InventoryItem[],
  operation: SheetPortalSyncOperation = 'upsert',
  reason = 'portal-stock-change'
) => {
  const payloadItems = buildSheetPortalItemPayloads(items, operation);
  if (!payloadItems.length) return { ok: true, skipped: true, reason: 'No Sheet-managed tyre rows to sync.' };

  const { data, error } = await (supabase.functions.invoke as any)('sync-portal-inventory-to-sheet', {
    body: {
      reason,
      items: payloadItems
    }
  });

  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error || 'Portal stock could not be mirrored to Google Sheet.');
  return data;
};

export const subscribeToSheetInventorySyncRuns = (
  onChange: () => void,
  onError?: (error: unknown) => void
) => {
  const channel = supabase
    .channel('public:sheet_inventory_sync_runs')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sheet_inventory_sync_runs' }, () => {
      onChange();
    })
    .subscribe((status, error) => {
      if (error) onError?.(error);
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') onError?.(new Error(status));
    });

  return () => {
    supabase.removeChannel(channel);
  };
};
