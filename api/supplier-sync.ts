import { getClientIpHash, verifyAdminSession } from '../server/adminSession.js';
import { readApiBody } from '../server/readApiBody.js';
import { verifyStaffSession } from '../server/staffSession.js';
import { createSupabaseAdmin } from '../server/supabaseAdmin.js';
import {
  REGISTRY_SUPPLIER_BY_CATALOG,
  isLiveSupplierCatalog,
  type LiveSupplierCatalog,
  type RegistryBackedSupplierCatalog
} from '../supplierCatalogMapping.js';
import type { SupplierSyncJob } from '../supplierSync.js';
import type { SupplierCatalog } from '../types.js';

const createRequestTimes = new Map<string, number>();
const CREATE_RATE_LIMIT_MS = 10_000;
type SupplierSyncCatalog = RegistryBackedSupplierCatalog | 'ALL_SUPPLIERS';

const safeServerError = () => 'Supplier synchronization could not be completed.';

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

const normalizeCatalog = (value: unknown): SupplierSyncCatalog | null => {
  const catalog = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (catalog === 'ALL_SUPPLIERS') return 'ALL_SUPPLIERS';
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

const countValue = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
};

const safeFailureMessage = (value: unknown) => {
  const message = typeof value === 'string' ? value.toLowerCase() : '';
  if (message.includes('login required') || message.includes('credential')) {
    return 'Supplier login required. Existing catalogue kept.';
  }
  if (message.includes('manual verification') || message.includes('captcha')) {
    return 'Supplier portal requires manual verification. Existing catalogue kept.';
  }
  if (message.includes('timed out') || message.includes('timeout')) {
    return 'Supplier portal timed out. Existing catalogue kept.';
  }
  if (message.includes('worker heartbeat')) {
    return 'The supplier sync worker stopped responding. Existing catalogue kept.';
  }
  return 'Supplier synchronization failed. Existing catalogue kept.';
};

const safeProgressMessage = (job: any) => {
  if (job?.status === 'failed' || job?.status === 'cancelled') {
    return safeFailureMessage(job?.safe_error || job?.progress_message);
  }
  if (job?.status === 'succeeded' || job?.status === 'partial') {
    return `Published ${countValue(job?.rows_published).toLocaleString('en-ZA')} stock rows`;
  }
  const message = typeof job?.progress_message === 'string' ? job.progress_message.trim() : '';
  return /^(starting|connecting|signing in|loading|reading|fetching|validating|publishing)/i.test(message)
    ? message.slice(0, 300)
    : 'Supplier synchronization is in progress.';
};

const safeJob = (job: any): SupplierSyncJob | null => {
  if (!job) return null;
  const summary = job.result_summary && typeof job.result_summary === 'object'
    ? job.result_summary
    : {};
  const suppliers = Array.isArray(summary.suppliers)
    ? summary.suppliers.map((result: any) => ({
        supplier: String(result?.supplier || 'Supplier').slice(0, 80),
        status: String(result?.status || 'unknown').slice(0, 30),
        detail: result?.status === 'published' || result?.status === 'ok'
          ? 'Published successfully.'
          : safeFailureMessage(result?.detail),
        rowsPublished: countValue(result?.rowsPublished),
        totalAvailableUnits: countValue(result?.totalAvailableUnits),
        rejectedRows: countValue(result?.rejectedRows),
        catalogs: Array.isArray(result?.catalogs)
          ? result.catalogs.map((catalog: unknown) => String(catalog).slice(0, 80))
          : []
      }))
    : [];

  return {
    ...job,
    progress_message: safeProgressMessage(job),
    safe_error: job.safe_error ? safeFailureMessage(job.safe_error) : null,
    result_summary: {
      currentSupplier: typeof summary.currentSupplier === 'string'
        ? summary.currentSupplier.slice(0, 80)
        : null,
      totalAvailableUnits: summary.totalAvailableUnits === undefined
        ? undefined
        : countValue(summary.totalAvailableUnits),
      rejectedRows: countValue(summary.rejectedRows),
      rejectionReasons: Array.isArray(summary.rejectionReasons)
        ? summary.rejectionReasons.slice(0, 25).map((reason: unknown) => String(reason).slice(0, 160))
        : [],
      suppliers
    }
  } as SupplierSyncJob;
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
    { data: activeJobData, error: activeError },
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

  const globalActiveJob = safeJob(activeJobData);
  const safeLatestJob = safeJob(latestJob);

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
  const activeJob = requestedCatalog
    ? globalActiveJob?.target_catalog === requestedCatalog ? globalActiveJob : null
    : globalActiveJob || null;
  const blockingJob = requestedCatalog && globalActiveJob?.target_catalog !== requestedCatalog
    ? globalActiveJob
    : null;

  return {
    activeJob,
    blockingJob,
    latestJob: safeLatestJob,
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
    const queryCatalog = normalizeStatusCatalog(request.query?.catalog);

    if (request.method === 'GET') {
      const staffSession = verifyStaffSession(request);
      if (!staffSession) {
        return response.status(401).json({ error: 'A secure staff session is required.' });
      }
      const supabase = createSupabaseAdmin();
      return response.status(200).json(await getSyncStatus(supabase, queryCatalog));
    }

    if (request.method !== 'POST') {
      response.setHeader('Allow', 'GET, POST');
      return response.status(405).json({ error: 'Unsupported method.' });
    }

    const session = verifyAdminSession(request);
    if (!session) return response.status(401).json({ error: 'Admin authentication is required.' });
    const staffSession = verifyStaffSession(request);
    if (!staffSession) {
      return response.status(401).json({ error: 'A secure staff session is required.' });
    }
    const supabase = createSupabaseAdmin();

    const lastCreate = createRequestTimes.get(session.staffName) || 0;
    if (Date.now() - lastCreate < CREATE_RATE_LIMIT_MS) {
      return response.status(429).json({ error: 'Please wait before requesting another sync.' });
    }
    const body = await readApiBody(request);
    const requestedCatalog = normalizeCatalog(body.catalog);
    if (!requestedCatalog) {
      return response.status(400).json({ error: 'Choose a supported supplier catalogue before syncing.' });
    }
    const isAllSuppliers = requestedCatalog === 'ALL_SUPPLIERS';
    const targetSupplier = isAllSuppliers
      ? null
      : REGISTRY_SUPPLIER_BY_CATALOG[requestedCatalog];
    const requestedByTerminal = staffSession.terminalId;

    const currentStatus = await getSyncStatus(
      supabase,
      isAllSuppliers ? null : requestedCatalog
    );
    if (currentStatus.activeJob || currentStatus.blockingJob) {
      return response.status(409).json({
        error: currentStatus.blockingJob
          ? `Another supplier is already syncing: ${currentStatus.blockingJob.target_supplier || 'supplier'}.`
          : `${targetSupplier || 'Live supplier portals'} are already syncing.`,
        ...currentStatus
      });
    }
    if (!currentStatus.worker.online) {
      return response.status(503).json({
        error: 'Sync Worker Offline. Restart the office supplier sync service, then try again.',
        ...currentStatus
      });
    }

    const { data: job, error } = await supabase
      .from('supplier_sync_jobs')
      .insert({
        scope: isAllSuppliers ? 'ALL_ENABLED' : 'SINGLE_SUPPLIER',
        target_supplier: targetSupplier,
        target_catalog: isAllSuppliers ? null : requestedCatalog,
        status: 'queued',
        progress_stage: 'queued',
        progress_current: 0,
        progress_message: isAllSuppliers
          ? 'Connecting to live supplier portals…'
          : `Connecting to ${targetSupplier}…`,
        requested_by_staff: session.staffName,
        requested_by_terminal: requestedByTerminal || 'UNKNOWN',
        requested_ip_hash: getClientIpHash(request)
      })
      .select(JOB_SELECT)
      .single();

    if (error?.code === '23505') {
      const status = await getSyncStatus(
        supabase,
        isAllSuppliers ? null : requestedCatalog
      );
      return response.status(409).json({
        error: 'A supplier sync is already queued or running.',
        ...status
      });
    }
    if (error) throw error;
    createRequestTimes.set(session.staffName, Date.now());

    await supabase.from('system_logs').insert({
      terminal_id: (requestedByTerminal || 'UNKNOWN') + ' (' + session.staffName + ')',
      event_type: 'SUPPLIER_SYNC_QUEUED',
      status: 'SUCCESS'
    });

    return response.status(202).json({
      ok: true,
      job,
      ...(await getSyncStatus(supabase, isAllSuppliers ? null : requestedCatalog))
    });
  } catch (error) {
    console.error('Supplier sync API failed.', error);
    return response.status(500).json({ error: safeServerError() });
  }
}
