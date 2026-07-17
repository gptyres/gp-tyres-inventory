import { createClient } from 'npm:@supabase/supabase-js@2.93.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wheel-catalog-import-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const BUCKET_NAME = 'wheel-catalog-images';
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const LOCAL_SOURCE_PREFIX = 'local-';

interface StartPayload {
  action: 'start';
  sourceRootFolderId: string;
  sourceLabel?: string | null;
}

interface ImportPayload {
  action?: 'import';
  importRunId: string;
  sourceRootFolderId: string;
  sourceLabel?: string | null;
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

interface FinalizePayload {
  action: 'finalize';
  importRunId: string;
  sourceRootFolderId: string;
  seenDriveFileIds: string[];
  filesScanned?: number;
  filesUploaded?: number;
  filesSkipped?: number;
  filesFailed?: number;
  errorMessage?: string | null;
}

interface AnalysisFields {
  brand?: string | null;
  model?: string | null;
  pcdAliases?: string[];
  wheelSize?: string | null;
  width?: string | null;
  finish?: string | null;
  colour?: string | null;
  offset?: string | null;
  centerBore?: string | null;
  loadRating?: string | null;
  vehicleHints?: string[];
  confidence?: number | null;
  needsReview?: boolean;
  reviewReason?: string | null;
  analysisModel?: string | null;
}

interface EnrichPayload extends AnalysisFields {
  action: 'enrich';
  driveFileId: string;
  imageOcrText?: string | null;
  imageSpecText?: string | null;
  tags?: string[];
  status?: 'completed' | 'failed';
}

interface EnrichBatchPayload {
  action: 'enrich-batch';
  items: Array<Omit<EnrichPayload, 'action'>>;
}

interface ReplaceFolderPayload {
  action: 'replace-folder';
  folderPath: string;
  seenDriveFileIds: string[];
}

type Payload = StartPayload | ImportPayload | FinalizePayload | EnrichPayload | EnrichBatchPayload | ReplaceFolderPayload;

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders,
    'Content-Type': 'application/json'
  }
});

const getRequiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const fetchAllRows = async <T>(
  buildQuery: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>
) => {
  const pageSize = 1000;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
};

const normalizePcd = (value?: string | null) => {
  const normalized = (value ?? '').trim().replace(/\s+/g, '').replace(/x/i, 'X').toUpperCase();
  return normalized || null;
};

const normalizeRimSize = (value?: string | null) => {
  const normalized = (value ?? '').trim();
  return normalized || null;
};

const getConfiguredImportToken = async (supabase: ReturnType<typeof createClient>) => {
  const { data, error } = await supabase
    .from('app_private_import_secrets')
    .select('name, secret_value')
    .in('name', ['WHEEL_CATALOG_SYNC_TOKEN', 'WHEEL_CATALOG_IMPORT_TOKEN']);

  if (error) throw error;
  const privateSecrets = new Map((data ?? []).map((row) => [row.name, row.secret_value]));

  return privateSecrets.get('WHEEL_CATALOG_SYNC_TOKEN')
    ?? Deno.env.get('WHEEL_CATALOG_SYNC_TOKEN')
    ?? Deno.env.get('WHEEL_CATALOG_IMPORT_TOKEN')
    ?? privateSecrets.get('WHEEL_CATALOG_IMPORT_TOKEN')
    ?? '';
};

const base64ToBytes = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const isStartPayload = (payload: Payload): payload is StartPayload => payload.action === 'start';
const isFinalizePayload = (payload: Payload): payload is FinalizePayload => payload.action === 'finalize';
const isEnrichPayload = (payload: Payload): payload is EnrichPayload => payload.action === 'enrich';
const isEnrichBatchPayload = (payload: Payload): payload is EnrichBatchPayload => payload.action === 'enrich-batch';
const isReplaceFolderPayload = (payload: Payload): payload is ReplaceFolderPayload => payload.action === 'replace-folder';

const validateImportPayload = (payload: ImportPayload) => {
  if (
    !payload.importRunId
    || !payload.sourceRootFolderId
    || !payload.driveFileId
    || !payload.driveFileId.startsWith(LOCAL_SOURCE_PREFIX)
    || !payload.fileName
    || !payload.storagePath
    || !payload.storagePath.startsWith('local-import/')
    || !payload.mimeType
    || !payload.driveUrl?.startsWith('local://')
    || !payload.localRelativePath
    || !payload.contentSha256
    || !payload.base64
  ) {
    return 'Missing or invalid local wheel catalog import fields.';
  }

  if (!IMAGE_MIME_TYPES.has(payload.mimeType)) {
    return `Unsupported image type: ${payload.mimeType}`;
  }

  if (!Number.isFinite(payload.sourceSizeBytes) || payload.sourceSizeBytes < 0) {
    return 'Invalid source image size.';
  }

  return '';
};

const startImport = async (supabase: ReturnType<typeof createClient>, payload: StartPayload) => {
  if (!payload.sourceRootFolderId) {
    return jsonResponse({ ok: false, error: 'Missing source root folder ID.' }, 400);
  }

  const { data, error } = await supabase
    .from('wheel_catalog_sync_runs')
    .insert({
      status: 'started',
      source_label: payload.sourceLabel || 'WHEEL CATALOG 2026 Q3_LIVE'
    })
    .select('id')
    .single();

  if (error) throw error;

  return jsonResponse({
    ok: true,
    importRunId: data.id,
    sourceRootFolderId: payload.sourceRootFolderId
  });
};

const importOne = async (supabase: ReturnType<typeof createClient>, payload: ImportPayload) => {
  const validationError = validateImportPayload(payload);
  if (validationError) return jsonResponse({ ok: false, error: validationError }, 400);

  const bytes = base64ToBytes(payload.base64);
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return jsonResponse({ ok: false, error: 'Image is too large. Maximum upload size is 10MB.' }, 400);
  }

  const upload = await supabase.storage
    .from(BUCKET_NAME)
    .upload(payload.storagePath, bytes, {
      contentType: payload.mimeType,
      upsert: true
    });

  if (upload.error) throw upload.error;

  const publicUrl = supabase.storage.from(BUCKET_NAME).getPublicUrl(payload.storagePath).data.publicUrl;
  const { error } = await supabase
    .from('wheel_catalog_items')
    .upsert({
      source_root_folder_id: payload.sourceRootFolderId,
      drive_file_id: payload.driveFileId,
      drive_folder_id: payload.driveFolderId ?? null,
      folder_path: payload.folderPath,
      folder_path_parts: payload.folderPathParts ?? [],
      category: payload.category ?? null,
      rim_size: normalizeRimSize(payload.rimSize),
      pcd: normalizePcd(payload.pcd),
      tags: Array.from(new Set(payload.tags ?? [])),
      file_name: payload.fileName,
      drive_url: payload.driveUrl,
      storage_bucket: BUCKET_NAME,
      storage_path: payload.storagePath,
      public_image_url: publicUrl,
      mime_type: payload.mimeType,
      local_relative_path: payload.localRelativePath,
      source_size_bytes: payload.sourceSizeBytes,
      content_sha256: payload.contentSha256,
      source_modified_at: payload.sourceModifiedAt ?? null,
      active: true,
      imported_at: new Date().toISOString()
    }, { onConflict: 'drive_file_id' });

  if (error) throw error;

  return jsonResponse({
    ok: true,
    importRunId: payload.importRunId,
    driveFileId: payload.driveFileId,
    storagePath: payload.storagePath,
    publicImageUrl: publicUrl
  });
};

const finalizeImport = async (supabase: ReturnType<typeof createClient>, payload: FinalizePayload) => {
  if (!payload.importRunId || !payload.sourceRootFolderId || !Array.isArray(payload.seenDriveFileIds)) {
    return jsonResponse({ ok: false, error: 'Missing finalize fields.' }, 400);
  }

  const seenIds = new Set(payload.seenDriveFileIds.filter((id) => id.startsWith(LOCAL_SOURCE_PREFIX)));
  const data = await fetchAllRows<{ drive_file_id: string }>((from, to) => (
    supabase
      .from('wheel_catalog_items')
      .select('drive_file_id')
      .eq('source_root_folder_id', payload.sourceRootFolderId)
      .eq('active', true)
      .range(from, to)
  ));

  const staleIds = (data ?? [])
    .map((row) => row.drive_file_id as string)
    .filter((id) => id.startsWith(LOCAL_SOURCE_PREFIX) && !seenIds.has(id));

  for (const staleChunk of chunk(staleIds, 100)) {
    const { error: updateError } = await supabase
      .from('wheel_catalog_items')
      .update({ active: false })
      .in('drive_file_id', staleChunk);
    if (updateError) throw updateError;
  }

  const filesFailed = Math.max(0, payload.filesFailed ?? 0);
  const status = filesFailed > 0 || payload.errorMessage ? 'failed' : 'completed';
  const { error: runUpdateError } = await supabase
    .from('wheel_catalog_sync_runs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      files_scanned: Math.max(0, payload.filesScanned ?? seenIds.size),
      files_uploaded: Math.max(0, payload.filesUploaded ?? seenIds.size),
      files_skipped: Math.max(0, payload.filesSkipped ?? 0),
      files_failed: filesFailed,
      rows_deactivated: staleIds.length,
      error_message: payload.errorMessage ?? null
    })
    .eq('id', payload.importRunId);

  if (runUpdateError) throw runUpdateError;

  return jsonResponse({
    ok: status === 'completed',
    importRunId: payload.importRunId,
    sourceRootFolderId: payload.sourceRootFolderId,
    seen: seenIds.size,
    deactivated: staleIds.length,
    filesScanned: payload.filesScanned ?? seenIds.size,
    filesUploaded: payload.filesUploaded ?? seenIds.size,
    filesSkipped: payload.filesSkipped ?? 0,
    filesFailed,
    error: status === 'failed' ? payload.errorMessage ?? 'Some catalog images failed to sync.' : undefined
  }, status === 'completed' ? 200 : 207);
};

const enrichImport = async (supabase: ReturnType<typeof createClient>, payload: EnrichPayload) => {
  if (!payload.driveFileId) {
    return jsonResponse({ ok: false, error: 'Missing wheel catalog row ID.' }, 400);
  }

  const status = payload.status ?? 'completed';
  const { data: existing, error: existingError } = await supabase
    .from('wheel_catalog_items')
    .select('tags')
    .eq('drive_file_id', payload.driveFileId)
    .eq('active', true)
    .maybeSingle();

  if (existingError) throw existingError;
  if (!existing) {
    return jsonResponse({ ok: false, error: 'Wheel catalog row was not found or is inactive.' }, 404);
  }

  const { error } = await supabase
    .from('wheel_catalog_items')
    .update({
      image_ocr_text: payload.imageOcrText ?? null,
      image_spec_text: payload.imageSpecText ?? null,
      image_analysis_status: status,
      image_analyzed_at: new Date().toISOString(),
      brand: payload.brand?.trim() || null,
      model: payload.model?.trim() || null,
      pcd_aliases: Array.from(new Set((payload.pcdAliases ?? []).map((value) => normalizePcd(value)).filter(Boolean))),
      wheel_size: payload.wheelSize?.trim() || null,
      width: payload.width?.trim() || null,
      finish: payload.finish?.trim() || null,
      colour: payload.colour?.trim() || null,
      wheel_offset: payload.offset?.trim() || null,
      center_bore: payload.centerBore?.trim() || null,
      load_rating: payload.loadRating?.trim() || null,
      vehicle_hints: Array.from(new Set((payload.vehicleHints ?? []).map((value) => String(value).trim()).filter(Boolean))),
      analysis_confidence: Number.isFinite(payload.confidence) ? payload.confidence : null,
      needs_review: Boolean(payload.needsReview),
      review_reason: payload.reviewReason?.trim() || null,
      image_analysis_model: payload.analysisModel?.trim() || null,
      tags: Array.from(new Set([
        ...((existing?.tags as string[] | null) ?? []),
        ...(payload.tags ?? [])
      ].map((tag) => String(tag).trim().toUpperCase()).filter(Boolean)))
    })
    .eq('drive_file_id', payload.driveFileId);

  if (error) throw error;

  return jsonResponse({
    ok: true,
    driveFileId: payload.driveFileId,
    status
  });
};

const enrichBatch = async (supabase: ReturnType<typeof createClient>, payload: EnrichBatchPayload) => {
  if (!Array.isArray(payload.items) || payload.items.length === 0 || payload.items.length > 50) {
    return jsonResponse({ ok: false, error: 'Enrichment batch must contain between 1 and 50 items.' }, 400);
  }

  const results: Array<{ driveFileId: string; ok: boolean; error?: string }> = [];
  for (const itemChunk of chunk(payload.items, 10)) {
    const chunkResults = await Promise.all(itemChunk.map(async (item) => {
      const response = await enrichImport(supabase, { ...item, action: 'enrich' });
      const body = await response.json().catch(() => ({}));
      return {
        driveFileId: item.driveFileId,
        ok: response.ok && body.ok !== false,
        error: response.ok && body.ok !== false ? undefined : String(body.error || `HTTP ${response.status}`)
      };
    }));
    results.push(...chunkResults);
  }

  const failed = results.filter((result) => !result.ok);
  return jsonResponse({
    ok: failed.length === 0,
    processed: results.length,
    completed: results.length - failed.length,
    failed: failed.length,
    errors: failed
  }, failed.length === 0 ? 200 : 207);
};

const replaceFolder = async (supabase: ReturnType<typeof createClient>, payload: ReplaceFolderPayload) => {
  const folderPath = String(payload.folderPath ?? '').trim();
  if (!folderPath || !Array.isArray(payload.seenDriveFileIds)) {
    return jsonResponse({ ok: false, error: 'Missing replace folder fields.' }, 400);
  }

  const seenIds = new Set(payload.seenDriveFileIds.filter((id) => id.startsWith(LOCAL_SOURCE_PREFIX)));
  const data = await fetchAllRows<{ drive_file_id: string; storage_path: string | null }>((from, to) => (
    supabase
      .from('wheel_catalog_items')
      .select('drive_file_id, storage_path')
      .eq('folder_path', folderPath)
      .eq('active', true)
      .range(from, to)
  ));

  const staleRows = (data ?? [])
    .map((row) => ({
      driveFileId: row.drive_file_id as string,
      storagePath: row.storage_path as string | null
    }))
    .filter((row) => row.driveFileId.startsWith(LOCAL_SOURCE_PREFIX) && !seenIds.has(row.driveFileId));

  const staleIds = staleRows.map((row) => row.driveFileId);
  for (const staleChunk of chunk(staleIds, 100)) {
    const { error: updateError } = await supabase
      .from('wheel_catalog_items')
      .update({ active: false })
      .in('drive_file_id', staleChunk);
    if (updateError) throw updateError;
  }

  const staleStoragePaths = Array.from(new Set(
    staleRows
      .map((row) => row.storagePath)
      .filter((path): path is string => Boolean(path))
  ));

  for (const pathChunk of chunk(staleStoragePaths, 100)) {
    const { error: removeError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove(pathChunk);
    if (removeError) throw removeError;
  }

  return jsonResponse({
    ok: true,
    folderPath,
    seen: seenIds.size,
    deactivated: staleIds.length,
    storageDeleted: staleStoragePaths.length
  });
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Only POST is supported.' }, 405);
  }

  try {
    const supabase = createClient(
      getRequiredEnv('SUPABASE_URL'),
      getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    );

    const configuredToken = await getConfiguredImportToken(supabase);
    const providedToken = request.headers.get('x-wheel-catalog-import-token') ?? '';
    if (!configuredToken || providedToken !== configuredToken) {
      return jsonResponse({ ok: false, error: 'Unauthorized import request.' }, 401);
    }

    const payload = await request.json() as Payload;
    if (isStartPayload(payload)) {
      return await startImport(supabase, payload);
    }

    if (isFinalizePayload(payload)) {
      return await finalizeImport(supabase, payload);
    }

    if (isEnrichPayload(payload)) {
      return await enrichImport(supabase, payload);
    }

    if (isEnrichBatchPayload(payload)) {
      return await enrichBatch(supabase, payload);
    }

    if (isReplaceFolderPayload(payload)) {
      return await replaceFolder(supabase, payload);
    }

    return await importOne(supabase, payload);
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null
        ? JSON.stringify(error)
        : String(error);

    return jsonResponse({
      ok: false,
      error: errorMessage
    }, 500);
  }
});
