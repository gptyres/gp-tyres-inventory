import { supabase } from './supabaseClient';

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
