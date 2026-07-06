import { createClient } from 'npm:@supabase/supabase-js@2.93.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supplier-image-import-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const BUCKET_NAME = 'supplier-stock-images';
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_STAFF_UPLOAD_BYTES = 10 * 1024 * 1024;

interface ImportPayload {
  supplier: string;
  source?: string;
  sourceFileId: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  designKey: string;
  finishKey?: string | null;
  rimSize?: string | null;
  pcd?: string | null;
  tags?: string[];
  base64: string;
  uploadedBy?: string | null;
}

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

const getConfiguredImportToken = async (supabase: ReturnType<typeof createClient>) => {
  const envToken = Deno.env.get('SUPPLIER_IMAGE_IMPORT_TOKEN');
  if (envToken) return envToken;

  const { data, error } = await supabase
    .from('app_private_import_secrets')
    .select('secret_value')
    .eq('name', 'SUPPLIER_IMAGE_IMPORT_TOKEN')
    .maybeSingle();

  if (error) throw error;
  return data?.secret_value ?? '';
};

const base64ToBytes = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const isStaffUploadPayload = (payload: ImportPayload) => (
  payload.source === 'staff-upload'
  && payload.sourceFileId.startsWith('staff-upload:')
  && payload.storagePath.startsWith('tyres/staff-upload/')
  && Boolean(payload.finishKey?.trim())
);

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

    const payload = await request.json() as ImportPayload;
    if (!payload.supplier || !payload.sourceFileId || !payload.fileName || !payload.designKey || !payload.base64) {
      return jsonResponse({ ok: false, error: 'Missing required image import fields.' }, 400);
    }

    const configuredToken = await getConfiguredImportToken(supabase);
    const providedToken = request.headers.get('x-supplier-image-import-token') ?? '';
    const hasValidImportToken = Boolean(configuredToken && providedToken === configuredToken);
    const isStaffUpload = isStaffUploadPayload(payload);
    if (!hasValidImportToken && !isStaffUpload) {
      return jsonResponse({ ok: false, error: 'Unauthorized import request.' }, 401);
    }

    if (!IMAGE_MIME_TYPES.has(payload.mimeType)) {
      return jsonResponse({ ok: false, error: `Unsupported image type: ${payload.mimeType}` }, 400);
    }

    const bytes = base64ToBytes(payload.base64);
    if (isStaffUpload && bytes.byteLength > MAX_STAFF_UPLOAD_BYTES) {
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
    let replacedStaffUploadRows = 0;

    if (isStaffUpload) {
      const { data: replacedRows, error: replaceError } = await supabase
        .from('supplier_stock_images')
        .update({ active: false })
        .eq('supplier', payload.supplier)
        .eq('source', 'staff-upload')
        .eq('design_key', payload.designKey)
        .eq('finish_key', payload.finishKey!.trim())
        .neq('source_file_id', payload.sourceFileId)
        .select('id');

      if (replaceError) throw replaceError;
      replacedStaffUploadRows = replacedRows?.length ?? 0;
    }

    const { error } = await supabase
      .from('supplier_stock_images')
      .upsert({
        supplier: payload.supplier,
        source: payload.source?.trim() || 'local-import',
        source_file_id: payload.sourceFileId,
        file_name: payload.fileName,
        storage_bucket: BUCKET_NAME,
        storage_path: payload.storagePath,
        public_image_url: publicUrl,
        mime_type: payload.mimeType,
        design_key: payload.designKey,
        finish_key: payload.finishKey ?? null,
        rim_size: payload.rimSize ?? null,
        pcd: payload.pcd ?? null,
        tags: Array.from(new Set([
          ...(payload.tags ?? []),
          payload.uploadedBy ? `uploaded-by:${payload.uploadedBy}` : ''
        ].filter(Boolean))),
        active: true,
        imported_at: new Date().toISOString()
      }, { onConflict: 'supplier,source_file_id' });

    if (error) throw error;

    return jsonResponse({
      ok: true,
      supplier: payload.supplier,
      source: payload.source?.trim() || 'local-import',
      sourceFileId: payload.sourceFileId,
      designKey: payload.designKey,
      finishKey: payload.finishKey ?? null,
      storagePath: payload.storagePath,
      publicImageUrl: publicUrl,
      replacedStaffUploadRows
    });
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
