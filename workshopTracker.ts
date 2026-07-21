export type WorkshopJobStatus = 'CHECK_IN' | 'IN_PROGRESS' | 'READY' | 'COLLECTED' | 'CANCELLED';
export type WorkshopPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export const TECHNICIANS = [
  'Klassie',
  'Richard',
  'Abu Bakr',
  'Saeed',
  'Rajab',
  'Ashley',
  'Blessing',
  'Clement',
  'Patrick'
] as const;

export const WORKSHOP_AGENTS = ['Noor', 'Mac', 'Rafiek', 'Yaseen', 'Laeeq', 'Zahied', 'Niyaaz'];
export const PAID_BY_OPTIONS = ['Cash', 'Card', 'EFT', 'Account', 'Other'] as const;

export interface WorkshopJob {
  id: string;
  job_number: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  vehicle_details: string;
  registration: string | null;
  service_type: string;
  status: WorkshopJobStatus;
  priority: WorkshopPriority;
  technician: string | null;
  technicians: string[];
  agent: string | null;
  job_date: string;
  ticket_number: string | null;
  paid_by: string | null;
  scheduled_for: string | null;
  estimated_minutes: number | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface WorkshopSummary {
  active: number;
  today: number;
  ready: number;
  overdue: number;
}

export type WorkshopBreakType = 'TEA_1' | 'TEA_2' | 'LUNCH' | 'TYRE_COLLECTION';

export interface WorkshopTechnicianBreak {
  id: string;
  technician: string;
  break_type: WorkshopBreakType;
  started_at: string;
  ended_at: string | null;
}

export interface WorkshopBoardResponse {
  jobs: WorkshopJob[];
  summary: WorkshopSummary;
  agents: string[];
  breaks: WorkshopTechnicianBreak[];
}

export interface WorkshopJobInput {
  customer_name: string;
  customer_phone?: string;
  vehicle_details: string;
  registration?: string;
  service_type: string;
  priority?: WorkshopPriority;
  technician?: string;
  technicians?: string[];
  agent?: string;
  job_date?: string;
  ticket_number?: string;
  paid_by?: string;
  scheduled_for?: string;
  estimated_minutes?: number;
  notes?: string;
}

const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, { ...init, credentials: 'same-origin' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'The workshop request failed.');
  return payload as T;
};

export const fetchWorkshopBoard = (signal?: AbortSignal) => request<WorkshopBoardResponse>('/api/workshop', { signal });

export const createWorkshopJob = (job: WorkshopJobInput) => request<{ job: WorkshopJob }>('/api/workshop', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(job)
});

export const updateWorkshopJob = (id: string, update: Partial<WorkshopJobInput> & { status?: WorkshopJobStatus }) => (
  request<{ job: WorkshopJob }>(`/api/workshop/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update)
  })
);

export const startWorkshopBreak = (technician: string, break_type: WorkshopBreakType) => request<{ break: WorkshopTechnicianBreak }>('/api/workshop', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'START_BREAK', technician, break_type })
});

export const endWorkshopBreak = (id: string) => request<{ break: WorkshopTechnicianBreak }>('/api/workshop', {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'END_BREAK', id })
});

export const deleteWorkshopJob = (id: string) => request<{ ok: boolean }>(`/api/workshop/${encodeURIComponent(id)}`, {
  method: 'DELETE'
});
