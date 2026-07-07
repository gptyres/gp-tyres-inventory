import { supabase, WheelCatalogItemRow, WheelCatalogSyncRunRow } from './supabaseClient';

export const WHEEL_CATALOG_SOURCE_LABEL = 'WHEEL CATALOG 2026 Q3_LIVE';
export const WHEEL_CATALOG_SOURCE_ROOT_ID = 'local-wheel-catalog-2026-q3-live';
export const WHEEL_CATALOG_DRIVE_SOURCE_LABEL = 'Public Google Drive Wheel Catalog';
export const WHEEL_CATALOG_DRIVE_ROOT_ID = '15MhCztz6IvUXem2okdZkd13zHtdvzCKx';
export const WHEEL_CATALOG_DRIVE_FOLDER_URL = `https://drive.google.com/drive/folders/${WHEEL_CATALOG_DRIVE_ROOT_ID}`;
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
  scanned?: number;
  imported?: number;
  skipped?: number;
  deactivated?: number;
  totalImages?: number;
  processedImages?: number;
  nextImageOffset?: number;
  hasMore?: boolean;
  imageOffset?: number;
  imageLimit?: number;
  errors?: string[];
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

const getFunctionErrorMessage = async (error: unknown, fallback: string) => {
  const normalizeMessage = (message: string) => {
    if (message.includes("Method doesn't allow unregistered callers") || message.includes('PERMISSION_DENIED')) {
      return 'Google Drive API access is not configured. Add GOOGLE_DRIVE_API_KEY as a Supabase Edge Function secret, or configure Google service-account credentials for the public Drive folder.';
    }

    return message;
  };

  try {
    const context = (error as { context?: unknown })?.context;
    if (context && typeof context === 'object') {
      const response = context as Response;
      const payload = typeof response.clone === 'function'
        ? await response.clone().json().catch(() => null) as { error?: string; errors?: string[] } | null
        : typeof response.json === 'function'
          ? await response.json().catch(() => null) as { error?: string; errors?: string[] } | null
          : null;

      if (payload?.error) return normalizeMessage(payload.error);
      if (payload?.errors?.length) return normalizeMessage(payload.errors.join('\n'));

      const plainError = (context as { error?: string; message?: string }).error
        ?? (context as { error?: string; message?: string }).message;
      if (plainError) return normalizeMessage(plainError);
    }
  } catch {
    // Fall through to the standard error message.
  }

  return normalizeMessage(error instanceof Error ? error.message : fallback);
};

const invokeLocalImport = async (body: Record<string, unknown>, importToken: string): Promise<WheelCatalogSyncResult> => {
  const { data, error } = await supabase.functions.invoke('import-wheel-catalog-local', {
    body,
    headers: {
      'x-wheel-catalog-import-token': importToken
    }
  });

  if (error) {
    return { ok: false, error: await getFunctionErrorMessage(error, 'Wheel catalog import failed.') };
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

export const syncGoogleDriveWheelCatalog = async (
  syncToken: string
): Promise<WheelCatalogSyncResult> => {
  let imageOffset = 0;
  const imageLimit = 50;
  const totals: WheelCatalogSyncResult = {
    ok: true,
    scanned: 0,
    imported: 0,
    skipped: 0,
    deactivated: 0,
    errors: []
  };

  for (let batch = 0; batch < 100; batch += 1) {
    const { data, error } = await supabase.functions.invoke('sync-wheel-catalog', {
      body: {
        rootFolderId: WHEEL_CATALOG_DRIVE_ROOT_ID,
        sourceLabel: WHEEL_CATALOG_DRIVE_SOURCE_LABEL,
        deactivateSourceRootFolderIds: [WHEEL_CATALOG_SOURCE_ROOT_ID],
        imageOffset,
        imageLimit
      },
      headers: {
        'x-wheel-catalog-sync-token': syncToken
      }
    });

    if (error) {
      return { ok: false, error: await getFunctionErrorMessage(error, 'Google Drive wheel catalog sync failed.') };
    }

    const result = data as WheelCatalogSyncResult;
    totals.scanned = Math.max(totals.scanned ?? 0, result.scanned ?? 0);
    totals.imported = (totals.imported ?? 0) + (result.imported ?? 0);
    totals.skipped = Math.max(totals.skipped ?? 0, result.skipped ?? 0);
    totals.deactivated = result.deactivated ?? totals.deactivated ?? 0;
    totals.totalImages = result.totalImages ?? totals.totalImages;
    totals.processedImages = (totals.processedImages ?? 0) + (result.processedImages ?? 0);
    totals.nextImageOffset = result.nextImageOffset ?? totals.nextImageOffset;
    totals.hasMore = result.hasMore;
    totals.errors = [...(totals.errors ?? []), ...(result.errors ?? [])];

    if (!result.ok) {
      return {
        ...totals,
        ok: false,
        error: result.error || result.errors?.join('\n') || 'Google Drive wheel catalog sync failed.'
      };
    }

    if (!result.hasMore) {
      return totals;
    }

    const nextOffset = result.nextImageOffset ?? imageOffset + (result.processedImages ?? imageLimit);
    if (nextOffset <= imageOffset) {
      return {
        ...totals,
        ok: false,
        error: 'Google Drive sync stopped because the batch cursor did not advance.'
      };
    }

    imageOffset = nextOffset;
  }

  return {
    ...totals,
    ok: false,
    error: 'Google Drive sync stopped after 100 batches before completion.'
  };
};
