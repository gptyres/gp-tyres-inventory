import { getClientIpHash, verifyAdminSession } from '../server/adminSession.js';
import { readApiBody } from '../server/readApiBody.js';
import { createSupabaseAdmin } from '../server/supabaseAdmin.js';
import {
  REGISTRY_SUPPLIER_BY_CATALOG,
  isLiveSupplierCatalog,
  type LiveSupplierCatalog,
  type RegistryBackedSupplierCatalog
} from '../supplierCatalogMapping.js';
import type { SupplierCatalog } from '../types.js';

const createRequestTimes = new Map<string, number>();
const CREATE_RATE_LIMIT_MS = 10_000;

const JOB_SELECT = [
  'id',
  'scope',
  'target_supplier',
  'target_catalog',
  'status',
  'worker_id',
  'runner_run_id',
  'artifact_name',
  'suppliers_total',
  'suppliers_completed',
  'suppliers_failed',
  'suppliers_skipped',
  'rows_published',
  'progress_stage',
  'progress_current',
  'progress_total',
  'progress_message',
  'result_summary',
  'safe_error',
  'requested_at',
  'started_at',
  'heartbeat_at',
  'completed_at'
].join(',');

const normalizeCatalog = (value: unknown): RegistryBackedSupplierCatalog | null => {
  const catalog = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return Object.prototype.hasOwnProperty.call(REGISTRY_SUPPLIER_BY_CATALOG, catalog)
    ? catalog as RegistryBackedSupplierCatalog
    : null;
};

const normalizeStatusCatalog = (value: unknown): LiveSupplierCatalog | null => {
  const catalog = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return isLiveSupplierCatalog(catalog as SupplierCatalog)
    ? catalog as LiveSupplierCatalog
    : null;
};

const getSyncStatus = async (
  supabase: ReturnType<typeof createSupabaseAdmin>,
  requestedCatalog: LiveSupplierCatalog | null
) => {
  let latestQuery = supabase
    .from('supplier_sync_jobs')
    .select(JOB_SELECT)
    .order('requested_at', { ascending: false })
    .limit(1);

  if (requestedCatalog) {
    latestQuery = latestQuery.eq('target_catalog', requestedCatalog);
  }

  const activeSnapshotPromise = requestedCatalog
    ? supabase
      .from('supplier_catalog_snapshots')
      .select('id,job_id,row_count,activated_at')
      .eq('catalog_key', requestedCatalog)
      .eq('status', 'active')
      .order('activated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [
    { data: activeJob, error: activeError },
    { data: latestJob, error: latestError },
    { data: worker, error: workerError },
    { data: activeSnapshot, error: snapshotError }
  ] = await Promise.all([
    supabase
      .from('supplier_sync_jobs')
      .select(JOB_SELECT)
      .in('status', ['queued', 'running'])
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    latestQuery.maybeSingle(),
    supabase
      .from('supplier_sync_workers')
      .select('worker_id,status,current_job_id,last_heartbeat_at,started_at')
      .order('last_heartbeat_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    activeSnapshotPromise
  ]);

  if (activeError) throw activeError;
  if (latestError) throw latestError;
  if (workerError) throw workerError;
  if (snapshotError) throw snapshotError;

  let sourceJob: { scope?: string; artifact_name?: string | null } | null = null;
  if (activeSnapshot?.job_id) {
    const { data, error } = await supabase
      .from('supplier_sync_jobs')
      .select('scope,artifact_name')
      .eq('id', activeSnapshot.job_id)
      .maybeSingle();
    if (error) throw error;
    sourceJob = data;
  }

  const heartbeatTime = worker?.last_heartbeat_at ? new Date(worker.last_heartbeat_at).getTime() : 0;
  const online = heartbeatTime > Date.now() - 45_000;

  return {
    activeJob: activeJob || null,
    latestJob: latestJob || null,
    lastSuccessfulSync: activeSnapshot?.activated_at
      ? {
          at: activeSnapshot.activated_at,
          rowCount: activeSnapshot.row_count || 0,
          jobId: activeSnapshot.job_id,
          scope: sourceJob?.scope || undefined,
          artifactName: sourceJob?.artifact_name || null
        }
      : null,
    worker: worker
      ? { ...worker, online }
      : {
          worker_id: null,
          status: 'offline',
          current_job_id: null,
          last_heartbeat_at: null,
          started_at: null,
          online: false
        }
  };
};

export default async function handler(request: any, response: any) {
  response.setHeader('Cache-Control', 'no-store');

  try {
    const supabase = createSupabaseAdmin();
    const queryCatalog = normalizeStatusCatalog(request.query?.catalog);

    if (request.method === 'GET') {
      return response.status(200).json(await getSyncStatus(supabase, queryCatalog));
    }

    if (request.method !== 'POST') {
      response.setHeader('Allow', 'GET, POST');
      return response.status(405).json({ error: 'Unsupported method.' });
    }

    const session = verifyAdminSession(request);
    if (!session) return response.status(401).json({ error: 'Admin authentication is required.' });

    const lastCreate = createRequestTimes.get(session.staffName) || 0;
    if (Date.now() - lastCreate < CREATE_RATE_LIMIT_MS) {
      return response.status(429).json({ error: 'Please wait before requesting another sync.' });
    }
    createRequestTimes.set(session.staffName, Date.now());

    const body = await readApiBody(request);
    const requestedCatalog = normalizeCatalog(body.catalog);
    if (!requestedCatalog) {
      return response.status(400).json({ error: 'Choose a supported supplier catalogue before syncing.' });
    }
    const targetSupplier = REGISTRY_SUPPLIER_BY_CATALOG[requestedCatalog];
    const requestedByTerminal = typeof body.terminal === 'string'
      ? body.terminal.trim().slice(0, 80)
      : 'UNKNOWN';

    const { data: job, error } = await supabase
      .from('supplier_sync_jobs')
      .insert({
        scope: 'SINGLE_SUPPLIER',
        target_supplier: targetSupplier,
        target_catalog: requestedCatalog,
        status: 'queued',
        progress_stage: 'queued',
        progress_current: 0,
        progress_message: `Waiting to sync ${targetSupplier}…`,
        requested_by_staff: session.staffName,
        requested_by_terminal: requestedByTerminal || 'UNKNOWN',
        requested_ip_hash: getClientIpHash(request)
      })
      .select(JOB_SELECT)
      .single();

    if (error?.code === '23505') {
      const status = await getSyncStatus(supabase, requestedCatalog);
      return response.status(409).json({
        error: 'A supplier sync is already queued or running.',
        ...status
      });
    }
    if (error) throw error;

    await supabase.from('system_logs').insert({
      terminal_id: (requestedByTerminal || 'UNKNOWN') + ' (' + session.staffName + ')',
      event_type: 'SUPPLIER_SYNC_QUEUED',
      status: 'SUCCESS'
    });

    return response.status(202).json({
      ok: true,
      job,
      ...(await getSyncStatus(supabase, requestedCatalog))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Supplier sync request failed.';
    return response.status(500).json({ error: message });
  }
}
