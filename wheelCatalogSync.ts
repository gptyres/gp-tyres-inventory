import { supabase, WheelCatalogItemRow, WheelCatalogSyncRunRow } from './supabaseClient';

export const WHEEL_CATALOG_SOURCE_LABEL = 'WHEEL CATALOG 2026 Q3_LIVE';
export const WHEEL_CATALOG_SOURCE_ROOT_ID = 'local-wheel-catalog-2026-q3-live';
export const WHEEL_CATALOG_STAFF_UPLOAD_SOURCE_LABEL = 'Staff Wheel Uploads';
export const WHEEL_CATALOG_STAFF_UPLOAD_SOURCE_ROOT_ID = 'staff-wheel-catalog-uploads';
const PAGE_SIZE = 1000;

export interface WheelCatalogSyncResult {
  ok: boolean;
  importRunId?: string;
  sourceRootFolderId?: string;
  seen?: number;
  deactivated?: number;
  storageDeleted?: number;
  filesScanned?: number;
  filesUploaded?: number;
  filesSkipped?: number;
  filesFailed?: number;
  storagePath?: string;
  publicImageUrl?: string;
  error?: string;
}

export interface LocalWheelCatalogImportPayload {
  action?: 'import';
  importRunId: string;
  sourceRootFolderId: string;
  sourceLabel: string;
  driveFileId: string;
  driveFolderId?: string | null;
  folderPath: string;
  folderPathParts: string[];
  category?: string | null;
  rimSize?: string | null;
  pcd?: string | null;
  tags?: string[];
  fileName: string;
  driveUrl: string;
  storagePath: string;
  mimeType: string;
  localRelativePath: string;
  sourceSizeBytes: number;
  contentSha256: string;
  sourceModifiedAt?: string | null;
  base64: string;
}

const invokeLocalImport = async (body: Record<string, unknown>, importToken: string): Promise<WheelCatalogSyncResult> => {
  const { data, error } = await supabase.functions.invoke('import-wheel-catalog-local', {
    body,
    headers: {
      'x-wheel-catalog-import-token': importToken
    }
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return data as WheelCatalogSyncResult;
};

export const fetchWheelCatalogItems = async (): Promise<WheelCatalogItemRow[]> => {
  const rows: WheelCatalogItemRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('wheel_catalog_items')
      .select('*')
      .eq('active', true)
      .order('rim_size', { ascending: true, nullsFirst: false })
      .order('pcd', { ascending: true, nullsFirst: false })
      .order('folder_path', { ascending: true })
      .order('file_name', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows;
};

export const fetchLatestWheelCatalogSyncRun = async (): Promise<WheelCatalogSyncRunRow | null> => {
  const { data, error } = await supabase
    .from('wheel_catalog_sync_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
};

export const startLocalWheelCatalogSync = async (
  importToken: string,
  sourceLabel = WHEEL_CATALOG_SOURCE_LABEL,
  sourceRootFolderId = WHEEL_CATALOG_SOURCE_ROOT_ID
): Promise<WheelCatalogSyncResult> => {
  return invokeLocalImport({
    action: 'start',
    sourceRootFolderId,
    sourceLabel
  }, importToken);
};

export const importLocalWheelCatalogImage = async (
  payload: LocalWheelCatalogImportPayload,
  importToken: string
): Promise<WheelCatalogSyncResult> => {
  return invokeLocalImport({
    action: 'import',
    ...payload
  }, importToken);
};

export const finalizeLocalWheelCatalogSync = async (
  importToken: string,
  importRunId: string,
  seenDriveFileIds: string[],
  counts: {
    filesScanned: number;
    filesUploaded: number;
    filesSkipped: number;
    filesFailed: number;
    errorMessage?: string | null;
  }
): Promise<WheelCatalogSyncResult> => {
  return invokeLocalImport({
    action: 'finalize',
    importRunId,
    sourceRootFolderId: WHEEL_CATALOG_SOURCE_ROOT_ID,
    seenDriveFileIds,
    ...counts
  }, importToken);
};

export const replaceWheelCatalogFolder = async (
  importToken: string,
  folderPath: string,
  seenDriveFileIds: string[]
): Promise<WheelCatalogSyncResult> => {
  return invokeLocalImport({
    action: 'replace-folder',
    folderPath,
    seenDriveFileIds
  }, importToken);
};
