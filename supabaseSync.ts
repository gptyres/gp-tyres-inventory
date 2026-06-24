import { isSupabaseConfigured, SalesLogInsert, supabase, SystemLogInsert } from './supabaseClient';

type QueueTable = 'sales_log' | 'system_logs';

interface PendingWrite<T> {
  id: string;
  table: QueueTable;
  rows: T[];
  attempts: number;
  createdAt: string;
  lastError?: string;
}

interface SyncResult {
  ok: boolean;
  queued: boolean;
  error?: string;
}

const PENDING_SALES_KEY = 'gp-pending-sales-log-writes';
const PENDING_SYSTEM_KEY = 'gp-pending-system-log-writes';

const makePendingId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown Supabase error';
  }
};

const readQueue = <T,>(storageKey: string): PendingWrite<T>[] => {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeQueue = <T,>(storageKey: string, queue: PendingWrite<T>[]) => {
  localStorage.setItem(storageKey, JSON.stringify(queue));
};

const queueWrite = <T,>(storageKey: string, table: QueueTable, rows: T[], error?: string) => {
  const queue = readQueue<T>(storageKey);
  queue.push({
    id: makePendingId(),
    table,
    rows,
    attempts: 0,
    createdAt: new Date().toISOString(),
    lastError: error
  });
  writeQueue(storageKey, queue);
};

const insertSalesRows = async (rows: SalesLogInsert[]) => {
  const { error } = await (supabase.from('sales_log') as any).insert(rows);
  if (error) throw error;
};

const insertSystemRows = async (rows: SystemLogInsert[]) => {
  const { error } = await (supabase.from('system_logs') as any).insert(rows);
  if (error) throw error;
};

export const insertSalesLogEntries = async (rows: SalesLogInsert[]): Promise<SyncResult> => {
  if (rows.length === 0) return { ok: true, queued: false };
  if (!isSupabaseConfigured()) {
    queueWrite(PENDING_SALES_KEY, 'sales_log', rows, 'Supabase is not configured.');
    return { ok: false, queued: true, error: 'Supabase is not configured.' };
  }

  try {
    await insertSalesRows(rows);
    return { ok: true, queued: false };
  } catch (error) {
    const message = getErrorMessage(error);
    queueWrite(PENDING_SALES_KEY, 'sales_log', rows, message);
    return { ok: false, queued: true, error: message };
  }
};

export const insertSystemLogEntries = async (rows: SystemLogInsert[]): Promise<SyncResult> => {
  if (rows.length === 0) return { ok: true, queued: false };
  if (!isSupabaseConfigured()) {
    queueWrite(PENDING_SYSTEM_KEY, 'system_logs', rows, 'Supabase is not configured.');
    return { ok: false, queued: true, error: 'Supabase is not configured.' };
  }

  try {
    await insertSystemRows(rows);
    return { ok: true, queued: false };
  } catch (error) {
    const message = getErrorMessage(error);
    queueWrite(PENDING_SYSTEM_KEY, 'system_logs', rows, message);
    return { ok: false, queued: true, error: message };
  }
};

const flushQueue = async <T,>(
  storageKey: string,
  insertRows: (rows: T[]) => Promise<void>
) => {
  const queue = readQueue<T>(storageKey);
  if (!queue.length || !isSupabaseConfigured()) return 0;

  const remaining: PendingWrite<T>[] = [];
  let syncedCount = 0;

  for (const pendingWrite of queue) {
    try {
      await insertRows(pendingWrite.rows);
      syncedCount += pendingWrite.rows.length;
    } catch (error) {
      remaining.push({
        ...pendingWrite,
        attempts: pendingWrite.attempts + 1,
        lastError: getErrorMessage(error)
      });
    }
  }

  writeQueue(storageKey, remaining);
  return syncedCount;
};

export const flushPendingSupabaseWrites = async () => {
  const [salesSynced, systemSynced] = await Promise.all([
    flushQueue<SalesLogInsert>(PENDING_SALES_KEY, insertSalesRows),
    flushQueue<SystemLogInsert>(PENDING_SYSTEM_KEY, insertSystemRows)
  ]);

  return {
    salesSynced,
    systemSynced,
    remaining: getPendingSupabaseWriteCount()
  };
};

export const getPendingSupabaseWriteCount = () => {
  return readQueue<SalesLogInsert>(PENDING_SALES_KEY).length + readQueue<SystemLogInsert>(PENDING_SYSTEM_KEY).length;
};
