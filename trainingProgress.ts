import { STAFF_NAMES } from './config';

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
    id: 'quote',
    title: 'Create a quote',
    detail: 'Build a customer quote without deducting stock.'
  },
  {
    id: 'sale',
    title: 'Process a test sale',
    detail: 'Complete a sale and confirm stock is deducted correctly.'
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
    id: 'invoice-pdf',
    title: 'Export an invoice',
    detail: 'Print or download a PDF tax invoice or quote.'
  },
  {
    id: 'cash-up',
    title: 'Complete cash-up',
    detail: 'Run the end-of-shift cash and stock reconciliation.'
  }
];

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
  window.localStorage.setItem(TRAINING_PROGRESS_STORAGE_KEY, JSON.stringify(store));
};

export const notifyTrainingProgressChanged = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(TRAINING_PROGRESS_EVENT));
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
