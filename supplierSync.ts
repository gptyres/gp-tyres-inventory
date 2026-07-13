export type SupplierSyncJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'cancelled';

export interface SupplierSyncSupplierResult {
  supplier: string;
  status: string;
  detail?: string;
  rowsPublished?: number;
  catalogs?: string[];
}

export interface SupplierSyncJob {
  id: string;
  scope: 'ALL_ENABLED' | 'SINGLE_SUPPLIER' | 'MANUAL_UPLOAD';
  target_supplier?: string | null;
  target_catalog?: string | null;
  status: SupplierSyncJobStatus;
  requested_by_staff: string;
  requested_by_terminal: string;
  worker_id?: string | null;
  runner_run_id?: string | null;
  artifact_name?: string | null;
  suppliers_total: number;
  suppliers_completed: number;
  suppliers_failed: number;
  suppliers_skipped: number;
  rows_published: number;
  progress_stage: 'queued' | 'fetching' | 'validating' | 'publishing' | 'completed' | 'failed' | 'cancelled';
  progress_current: number;
  progress_total?: number | null;
  progress_message?: string | null;
  result_summary?: {
    currentSupplier?: string | null;
    suppliers?: SupplierSyncSupplierResult[];
  } | null;
  safe_error?: string | null;
  requested_at: string;
  started_at?: string | null;
  heartbeat_at?: string | null;
  completed_at?: string | null;
}

export interface SupplierSyncWorker {
  worker_id: string | null;
  status: string;
  current_job_id: string | null;
  last_heartbeat_at: string | null;
  started_at: string | null;
  online: boolean;
}

export interface SupplierSyncStatusResponse {
  activeJob: SupplierSyncJob | null;
  latestJob: SupplierSyncJob | null;
  worker: SupplierSyncWorker;
  lastSuccessfulSync: {
    at: string;
    rowCount: number;
    jobId: string;
    scope?: SupplierSyncJob['scope'];
    artifactName?: string | null;
  } | null;
}

const readJson = async (response: Response) => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || 'The server returned an invalid response.' };
  }
};

export const authenticateAdminSession = async (staffName: string, password: string) => {
  const response = await fetch('/api/admin-session', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ staffName, password })
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(data.error || 'Admin authentication failed.');
  return data;
};

export const clearAdminSession = async () => {
  await fetch('/api/admin-session', {
    method: 'DELETE',
    credentials: 'include'
  }).catch(() => undefined);
};

export const fetchSupplierSyncStatus = async (catalog: string): Promise<SupplierSyncStatusResponse> => {
  const response = await fetch('/api/supplier-sync?catalog=' + encodeURIComponent(catalog), {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(data.error || 'Supplier sync status is unavailable.');
  return data as SupplierSyncStatusResponse;
};

export const triggerSupplierSync = async (
  terminal: string,
  catalog: string
): Promise<SupplierSyncStatusResponse> => {
  const response = await fetch('/api/supplier-sync', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ terminal, catalog })
  });
  const data = await readJson(response);
  if (!response.ok && response.status !== 409) {
    throw new Error(data.error || 'Could not queue supplier sync.');
  }
  return data as SupplierSyncStatusResponse;
};
