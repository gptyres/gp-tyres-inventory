import { STAFF_NAMES } from './config';
import { isSupabaseConfigured, supabase } from './supabaseClient';

export interface TrainingTask {
  id: string;
  title: string;
  detail: string;
}

export interface TrainingProgressSummary {
  staffName: string;
  completed: number;
  total: number;
  percentage: number;
  completedTaskIds: string[];
}

export type TrainingProgressStore = Record<string, Record<string, boolean>>;

interface TrainingProgressRow {
  staff_name: string;
  tasks: Record<string, boolean> | null;
  terminal_id?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
}

export interface TrainingProgressSyncState {
  status: 'local' | 'syncing' | 'synced' | 'error';
  message: string;
  lastSyncedAt?: string;
}

export const TRAINING_PROGRESS_STORAGE_KEY = 'gp-training-progress-v1';
export const TRAINING_PROGRESS_EVENT = 'gp-training-progress-updated';

export const TERMINAL_STAFF_NAMES: Record<string, string> = {
  GP1: 'Noor',
  GP2: 'Rafiek',
  GP4: 'Laeeq',
  GP5: 'Yaseen',
  GP6: 'Mac',
  GP7: 'Zahied',
  GP8: 'Niyaaz',
  PC8: 'Niyaaz'
};

export const TRAINING_TASKS: TrainingTask[] = [
  {
    id: 'login',
    title: 'Log in successfully',
    detail: 'Use the correct terminal ID and access code.'
  },
  {
    id: 'internal-stock',
    title: 'Search GP stock',
    detail: 'Find internal tyres, wheels or accessories and confirm the location.'
  },
  {
    id: 'supplier-stock',
    title: 'Identify supplier stock',
    detail: 'Separate GP available stock from secondary supplier stock.'
  },
  {
    id: 'inventory-verify',
    title: 'Verify inventory before promising stock',
    detail: 'Confirm the exact item, location, portal quantity and physical count before committing stock to a customer.'
  },
  {
    id: 'inventory-movement',
    title: 'Handle stock movement correctly',
    detail: 'Use reservations for held stock, sales for paid stock, and escalate variances or receiving corrections to an authorised user.'
  },
  {
    id: 'supplier-visuals',
    title: 'Use supplier visuals',
    detail: 'Turn on visuals, load missing images, and replace wrong tyre images by brand and tread pattern.'
  },
  {
    id: 'quote',
    title: 'Create a quote',
    detail: 'Build a customer quote without deducting stock.'
  },
  {
    id: 'quote-module',
    title: 'Use quote module',
    detail: 'Paste messy supplier pricing, clean it up, and push selected quote lines into Quick POS.'
  },
  {
    id: 'sale',
    title: 'Process a test sale',
    detail: 'Complete a sale and confirm stock is deducted correctly.'
  },
  {
    id: 'customer-hub',
    title: 'Save customer details',
    detail: 'Use Customer Hub to find customers, upload customer lists, and reopen saved quotes or invoices.'
  },
  {
    id: 'services',
    title: 'Add services',
    detail: 'Add fitment, balancing, alignment or coilover installation.'
  },
  {
    id: 'reservation',
    title: 'Create a reservation',
    detail: 'Reserve stock with customer details and expiry date.'
  },
  {
    id: 'backorder',
    title: 'Create a backorder',
    detail: 'Log supplier stock that needs to be ordered in.'
  },
  {
    id: 'courier-declaration',
    title: 'Prepare a courier declaration',
    detail: 'Use Courier Logistics Assistant to select the parcel type and verify wheel size, tyre size, parcel count and address.'
  },
  {
    id: 'courier-handover',
    title: 'Complete courier handover',
    detail: 'Use measured packed details when available, save the declaration, and retain the tracking reference with the customer order.'
  },
  {
    id: 'invoice-pdf',
    title: 'Export an invoice',
    detail: 'Print or download a PDF tax invoice or quote.'
  },
  {
    id: 'wheel-catalog',
    title: 'Use wheel catalogue visuals',
    detail: 'Find wheel photos by size, PCD or supplier catalogue and use the correct visual for customers.'
  },
  {
    id: 'cash-up',
    title: 'Complete cash-up',
    detail: 'Run the end-of-shift cash and stock reconciliation.'
  },
  {
    id: 'sync-check',
    title: 'Check synced progress',
    detail: 'Confirm the same training progress appears on the dashboard and other staff portals.'
  }
];

const validTrainingTaskIds = new Set(TRAINING_TASKS.map((task) => task.id));

const isTrainingProgressStore = (value: unknown): value is TrainingProgressStore => {
  return !!value && typeof value === 'object' && !Array.isArray(value);
};

export const loadTrainingProgressStore = (): TrainingProgressStore => {
  if (typeof window === 'undefined') return {};

  try {
    const rawValue = window.localStorage.getItem(TRAINING_PROGRESS_STORAGE_KEY);
    if (!rawValue) return {};

    const parsedValue = JSON.parse(rawValue);
    return isTrainingProgressStore(parsedValue) ? parsedValue : {};
  } catch {
    return {};
  }
};

export const saveTrainingProgressStore = (store: TrainingProgressStore) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TRAINING_PROGRESS_STORAGE_KEY, JSON.stringify(normalizeTrainingProgressStore(store)));
};

export const notifyTrainingProgressChanged = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(TRAINING_PROGRESS_EVENT));
};

export const normalizeStaffTaskState = (tasks: unknown): Record<string, boolean> => {
  if (!tasks || typeof tasks !== 'object' || Array.isArray(tasks)) return {};

  return Object.entries(tasks as Record<string, unknown>).reduce<Record<string, boolean>>((state, [taskId, isComplete]) => {
    if (validTrainingTaskIds.has(taskId)) state[taskId] = Boolean(isComplete);
    return state;
  }, {});
};

export const normalizeTrainingProgressStore = (store: TrainingProgressStore): TrainingProgressStore => {
  return Object.entries(store).reduce<TrainingProgressStore>((normalizedStore, [staffName, tasks]) => {
    const cleanStaffName = String(staffName || '').trim();
    if (!cleanStaffName) return normalizedStore;
    normalizedStore[cleanStaffName] = normalizeStaffTaskState(tasks);
    return normalizedStore;
  }, {});
};

export const trainingProgressRowsToStore = (rows: TrainingProgressRow[] = []): TrainingProgressStore => (
  normalizeTrainingProgressStore(
    rows.reduce<TrainingProgressStore>((store, row) => {
      store[row.staff_name] = normalizeStaffTaskState(row.tasks);
      return store;
    }, {})
  )
);

export const fetchTrainingProgressStore = async (): Promise<TrainingProgressStore | null> => {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await (supabase as any)
    .from('training_progress')
    .select('staff_name,tasks,terminal_id,updated_by,updated_at')
    .order('staff_name', { ascending: true });

  if (error) throw error;
  return trainingProgressRowsToStore(data ?? []);
};

export const saveStaffTrainingProgressToSupabase = async (
  staffName: string,
  tasks: Record<string, boolean>,
  terminalId?: string
) => {
  if (!isSupabaseConfigured()) return;

  const cleanStaffName = staffName.trim();
  if (!cleanStaffName) return;

  const { error } = await (supabase as any)
    .from('training_progress')
    .upsert({
      staff_name: cleanStaffName,
      tasks: normalizeStaffTaskState(tasks),
      terminal_id: terminalId || null,
      updated_by: terminalId || cleanStaffName
    }, { onConflict: 'staff_name' });

  if (error) throw error;
};

export const resetStaffTrainingProgressInSupabase = async (staffName: string) => {
  if (!isSupabaseConfigured()) return;

  const cleanStaffName = staffName.trim();
  if (!cleanStaffName) return;

  const { error } = await (supabase as any)
    .from('training_progress')
    .delete()
    .eq('staff_name', cleanStaffName);

  if (error) throw error;
};

export const refreshTrainingProgressFromSupabase = async (): Promise<TrainingProgressStore | null> => {
  const remoteStore = await fetchTrainingProgressStore();
  if (!remoteStore) return null;

  saveTrainingProgressStore(remoteStore);
  notifyTrainingProgressChanged();
  return remoteStore;
};

export const subscribeToTrainingProgressChanges = (
  onStoreChange: (store: TrainingProgressStore) => void,
  onError?: (error: unknown) => void
) => {
  if (!isSupabaseConfigured()) return () => {};

  const refresh = async () => {
    try {
      const remoteStore = await refreshTrainingProgressFromSupabase();
      if (remoteStore) onStoreChange(remoteStore);
    } catch (error) {
      onError?.(error);
    }
  };

  const channel = supabase
    .channel('training_progress_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'training_progress' }, refresh)
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError?.(new Error(`Training progress realtime status: ${status}`));
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
};

export const getStaffTrainingProgress = (
  staffName: string,
  store: TrainingProgressStore = loadTrainingProgressStore()
): TrainingProgressSummary => {
  const staffTasks = store[staffName] || {};
  const completedTaskIds = TRAINING_TASKS.filter((task) => Boolean(staffTasks[task.id])).map((task) => task.id);
  const completed = completedTaskIds.length;
  const total = TRAINING_TASKS.length;

  return {
    staffName,
    completed,
    total,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    completedTaskIds
  };
};

export const getAllStaffTrainingProgress = (
  staffNames: string[] = STAFF_NAMES,
  store: TrainingProgressStore = loadTrainingProgressStore()
): TrainingProgressSummary[] => {
  return staffNames.map((staffName) => getStaffTrainingProgress(staffName, store));
};
