import { createClient } from 'npm:@supabase/supabase-js@2.93.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wheel-catalog-sync-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const DEFAULT_ROOT_FOLDER_ID = '15MhCztz6IvUXem2okdZkd13zHtdvzCKx';
const DEFAULT_SOURCE_LABEL = 'Public Google Drive Wheel Catalog';
const BUCKET_NAME = 'wheel-catalog-images';
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const MAX_SCAN_ITEMS = 5000;
const DEFAULT_IMAGE_BATCH_LIMIT = 75;
const MAX_IMAGE_BATCH_LIMIT = 150;
const FALLBACK_SYNC_PIN = '786';

interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
}

interface CatalogRow {
  source_root_folder_id: string;
  drive_file_id: string;
  drive_folder_id: string;
  folder_path: string;
  folder_path_parts: string[];
  category: string | null;
  rim_size: string | null;
  pcd: string | null;
  tags: string[];
  file_name: string;
  drive_url: string;
  storage_bucket: string;
  storage_path: string;
  public_image_url: string;
  mime_type: string;
  local_relative_path: string;
  source_size_bytes: number | null;
  content_sha256: string;
  source_modified_at: string | null;
  active: boolean;
  imported_at: string;
}

interface SyncResult {
  ok: boolean;
  scanned: number;
  imported: number;
  skipped: number;
  deactivated: number;
  rootFolderId: string;
  errors: string[];
  totalImages?: number;
  processedImages?: number;
  nextImageOffset?: number;
  hasMore?: boolean;
  imageOffset?: number;
  imageLimit?: number;
  dryRun?: boolean;
  dryRunImages?: number;
}

interface SyncPayload {
  rootFolderId?: string;
  sourceLabel?: string;
  deactivateSourceRootFolderIds?: string[];
  dryRun?: boolean;
  imageOffset?: number;
  imageLimit?: number;
}

type DriveAuth = {
  apiKey?: string;
  accessToken?: string;
  publicHtmlFallback?: boolean;
};

const jsonResponse = (body: unknown, status = 200) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
};

const getRequiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const getConfiguredSyncToken = async (supabase: ReturnType<typeof createClient>) => {
  const { data, error } = await supabase
    .from('app_private_import_secrets')
    .select('name, secret_value')
    .in('name', ['WHEEL_CATALOG_SYNC_TOKEN', 'WHEEL_CATALOG_IMPORT_TOKEN']);

  if (error) throw error;

  const privateSecrets = new Map((data ?? []).map((row) => [row.name as string, row.secret_value as string]));
  return privateSecrets.get('WHEEL_CATALOG_SYNC_TOKEN')
    ?? privateSecrets.get('WHEEL_CATALOG_IMPORT_TOKEN')
    ?? Deno.env.get('WHEEL_CATALOG_SYNC_TOKEN')
    ?? Deno.env.get('WHEEL_CATALOG_IMPORT_TOKEN')
    ?? FALLBACK_SYNC_PIN;
};

const base64UrlEncode = (input: string | ArrayBuffer) => {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : new Uint8Array(input);

  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
};

const pemToArrayBuffer = (pem: string) => {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
};

const getServiceAccount = (): GoogleServiceAccount => {
  const json = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (json) {
    const parsed = JSON.parse(json) as GoogleServiceAccount;
    if (parsed.client_email && parsed.private_key) return parsed;
  }

  const clientEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const privateKey = Deno.env.get('GOOGLE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
  if (clientEmail && privateKey) {
    return { client_email: clientEmail, private_key: privateKey };
  }

  throw new Error('Google Drive service account credentials are not configured.');
};

const getGoogleAccessToken = async () => {
  const serviceAccount = getServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: serviceAccount.client_email,
    scope: DRIVE_SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const unsignedJwt = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsignedJwt));
  const assertion = `${unsignedJwt}.${base64UrlEncode(signature)}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token request failed: ${response.status} ${text}`);
  }

  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error('Google token response did not include an access token.');
  return data.access_token;
};

const getDriveAuth = async (): Promise<DriveAuth> => {
  const apiKey = Deno.env.get('GOOGLE_DRIVE_API_KEY');
  if (apiKey) return { apiKey };
  if (
    Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    || (Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL') && Deno.env.get('GOOGLE_PRIVATE_KEY'))
  ) {
    return { accessToken: await getGoogleAccessToken() };
  }
  return { publicHtmlFallback: true };
};

const driveFetch = async (url: string, auth: DriveAuth) => {
  const requestUrl = new URL(url);
  if (auth.apiKey) requestUrl.searchParams.set('key', auth.apiKey);

  return await fetch(requestUrl.toString(), {
    headers: auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : undefined
  });
};

const decodeHtml = (value: string) => value
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
  .replace(/&#x([a-f0-9]+);/gi, (_match, code) => String.fromCharCode(Number.parseInt(code, 16)));

const stripHtml = (value: string) => decodeHtml(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

const guessImageMimeType = (fileName: string) => {
  const extension = fileName.toLowerCase().split('.').pop();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  return '';
};

const listPublicEmbeddedFolder = async (folderId: string) => {
  const response = await fetch(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#grid`, {
    headers: {
      'User-Agent': 'GP-Tyres-Wheel-Catalog-Sync/1.0'
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Public Drive folder ${folderId} could not be listed: ${response.status} ${text.slice(0, 500)}`);
  }

  const html = await response.text();
  const entries: DriveFile[] = [];
  const seenIds = new Set<string>();
  const entryRegex = /<div\b(?=[^>]*class="(?:[^"]*\s)?flip-entry(?:\s|")|[^>]*class='(?:[^']*\s)?flip-entry(?:\s|'))[\s\S]*?(?=<div\b(?=[^>]*class="(?:[^"]*\s)?flip-entry(?:\s|")|[^>]*class='(?:[^']*\s)?flip-entry(?:\s|'))|<\/body>|$)/gi;

  for (const match of html.matchAll(entryRegex)) {
    const block = match[0];
    const hrefMatch = block.match(/<a\b[^>]*href="([^"]+)"/i);
    const titleMatch = block.match(/<div\b[^>]*class="[^"]*\bflip-entry-title\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const href = hrefMatch ? decodeHtml(hrefMatch[1]) : '';
    const name = titleMatch ? stripHtml(titleMatch[1]) : '';
    if (!href || !name) continue;

    const folderMatch = href.match(/\/drive\/folders\/([^/?#]+)/i);
    const fileMatch = href.match(/\/file\/d\/([^/?#]+)/i);
    const id = folderMatch?.[1] ?? fileMatch?.[1] ?? '';
    if (!id || seenIds.has(id)) continue;

    const mimeType = folderMatch
      ? 'application/vnd.google-apps.folder'
      : guessImageMimeType(name);
    if (!mimeType) continue;

    seenIds.add(id);
    entries.push({
      id,
      name,
      mimeType,
      webViewLink: href
    });
  }

  return entries;
};

const listDriveFolder = async (folderId: string, auth: DriveAuth) => {
  if (auth.publicHtmlFallback && !auth.apiKey && !auth.accessToken) {
    return await listPublicEmbeddedFolder(folderId);
  }

  const files: DriveFile[] = [];
  let pageToken = '';

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      pageSize: '1000',
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, webViewLink)',
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true'
    });
    if (pageToken) params.set('pageToken', pageToken);

    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, auth);
    if (!response.ok) {
      const text = await response.text();
      if (!auth.apiKey && !auth.accessToken && response.status === 403) {
        return await listPublicEmbeddedFolder(folderId);
      }
      throw new Error(`Drive folder ${folderId} could not be listed: ${response.status} ${text}`);
    }

    const data = await response.json() as { files?: DriveFile[]; nextPageToken?: string };
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken ?? '';
  } while (pageToken);

  return files;
};

const downloadDriveFile = async (file: DriveFile, auth: DriveAuth) => {
  const response = auth.publicHtmlFallback && !auth.apiKey && !auth.accessToken
    ? await fetch(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(file.id)}`, {
      headers: {
        'User-Agent': 'GP-Tyres-Wheel-Catalog-Sync/1.0'
      }
    })
    : await driveFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`, auth);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Drive file ${file.id} could not be downloaded: ${response.status} ${text.slice(0, 500)}`);
  }
  return await response.arrayBuffer();
};

const normalizeToken = (value: string) => value.replace(/×/g, 'x').replace(/\s+/g, ' ').trim();

const sha256Hex = async (buffer: ArrayBuffer) => {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const isIgnoredFolder = (folderName: string) => folderName.trim().startsWith('_');

const parseSizeAndPcd = (pathParts: string[], fileName: string) => {
  const source = normalizeToken([...pathParts, fileName].join(' '));
  const sizeMatch = source.match(/\b(1[3-9]|2[0-4])\s*(?:inch|inches|in|")?\b/i);
  const pcdMatch = source.match(/\b([456])\s*x\s*(\d{3}(?:\.\d)?)\b/i)
    ?? source.match(/\b([456])(\d{3})\b/i);

  const rimSize = sizeMatch ? sizeMatch[1] : null;
  const pcd = pcdMatch ? `${pcdMatch[1]}X${pcdMatch[2]}`.toUpperCase() : null;
  const tags = Array.from(new Set(
    source
      .toUpperCase()
      .replace(/\b(?:INCH|INCHES|RIMS?|MAGS?|PCD|UPDATE[DS]?|NEW|FOLDER)\b/g, ' ')
      .replace(/\b[456]\s*X\s*\d{3}(?:\.\d)?\b/g, ' ')
      .replace(/\b(?:1[3-9]|2[0-4])\b/g, ' ')
      .split(/[^A-Z0-9.]+/)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length >= 3)
  ));

  return { rimSize, pcd, tags };
};

const sanitizePathPart = (value: string) => {
  const fallback = 'image';
  return value
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120)
    || fallback;
};

const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const fetchActiveRowsForSources = async (
  supabase: ReturnType<typeof createClient>,
  sourceRootFolderIds: string[]
) => {
  const rows: { drive_file_id: string }[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('wheel_catalog_items')
      .select('drive_file_id')
      .in('source_root_folder_id', sourceRootFolderIds)
      .eq('active', true)
      .range(from, from + pageSize - 1);
    if (error) throw error;

    const page = data ?? [];
    rows.push(...page.map((row) => ({ drive_file_id: row.drive_file_id as string })));
    if (page.length < pageSize) break;
  }

  return rows;
};

const safeInteger = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
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

    const configuredToken = await getConfiguredSyncToken(supabase);
    const providedToken = request.headers.get('x-wheel-catalog-sync-token') ?? '';
    if (!configuredToken || providedToken !== configuredToken) {
      return jsonResponse({ ok: false, error: 'Invalid sync token.' }, 401);
    }

    const body = await request.json().catch(() => ({})) as SyncPayload;
    const rootFolderId = body.rootFolderId
      ?? Deno.env.get('WHEEL_CATALOG_DRIVE_FOLDER_ID')
      ?? DEFAULT_ROOT_FOLDER_ID;
    const sourceLabel = body.sourceLabel || DEFAULT_SOURCE_LABEL;
    const imageOffset = safeInteger(body.imageOffset, 0);
    const requestedImageLimit = body.dryRun && body.imageLimit == null
      ? MAX_SCAN_ITEMS
      : safeInteger(body.imageLimit, DEFAULT_IMAGE_BATCH_LIMIT);
    const imageLimit = Math.max(1, Math.min(requestedImageLimit, MAX_IMAGE_BATCH_LIMIT));
    const deactivateSourceRootFolderIds = Array.from(new Set([
      rootFolderId,
      ...(body.deactivateSourceRootFolderIds ?? [])
    ].filter(Boolean)));

    const { data: syncRun, error: syncRunError } = await supabase
      .from('wheel_catalog_sync_runs')
      .insert({
        status: 'started',
        source_label: sourceLabel
      })
      .select('id')
      .single();
    if (syncRunError) throw syncRunError;

    const driveAuth = await getDriveAuth();
    const queue = [{ folderId: rootFolderId, pathParts: [] as string[] }];
    const rows: CatalogRow[] = [];
    const errors: string[] = [];
    let scanned = 0;
    let skipped = 0;
    let dryRunImages = 0;
    let totalImages = 0;
    let processedImages = 0;
    const allDriveImageIds: string[] = [];

    while (queue.length && scanned < MAX_SCAN_ITEMS) {
      const current = queue.shift();
      if (!current) break;

      const children = await listDriveFolder(current.folderId, driveAuth);
      for (const child of children) {
        scanned += 1;
        if (scanned > MAX_SCAN_ITEMS) {
          errors.push(`Scan stopped at ${MAX_SCAN_ITEMS} Drive items.`);
          break;
        }

        if (child.mimeType === 'application/vnd.google-apps.folder') {
          if (isIgnoredFolder(child.name)) {
            skipped += 1;
            continue;
          }

          queue.push({
            folderId: child.id,
            pathParts: [...current.pathParts, child.name]
          });
          continue;
        }

        if (!IMAGE_MIME_TYPES.has(child.mimeType)) {
          skipped += 1;
          continue;
        }

        const imageIndex = totalImages;
        totalImages += 1;
        allDriveImageIds.push(child.id);

        if (body.dryRun) {
          dryRunImages += 1;
          continue;
        }

        if (imageIndex < imageOffset || processedImages >= imageLimit) {
          continue;
        }

        processedImages += 1;

        try {
          const parsed = parseSizeAndPcd(current.pathParts, child.name);
          const storagePath = `drive/${rootFolderId}/${child.id}-${sanitizePathPart(child.name)}`;

          const bytes = await downloadDriveFile(child, driveAuth);
          const contentSha256 = await sha256Hex(bytes);
          const upload = await supabase.storage
            .from(BUCKET_NAME)
            .upload(storagePath, bytes, {
              contentType: child.mimeType,
              upsert: true
            });

          if (upload.error) {
            throw upload.error;
          }

          const publicUrl = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath).data.publicUrl;
          rows.push({
            source_root_folder_id: rootFolderId,
            drive_file_id: child.id,
            drive_folder_id: current.folderId,
            folder_path: current.pathParts.join(' / '),
            folder_path_parts: current.pathParts,
            category: current.pathParts[0] ?? null,
            rim_size: parsed.rimSize,
            pcd: parsed.pcd,
            tags: parsed.tags,
            file_name: child.name,
            drive_url: child.webViewLink ?? `https://drive.google.com/file/d/${child.id}/view`,
            storage_bucket: BUCKET_NAME,
            storage_path: storagePath,
            public_image_url: publicUrl,
            mime_type: child.mimeType,
            local_relative_path: [...current.pathParts, child.name].join('/'),
            source_size_bytes: child.size ? Number(child.size) : bytes.byteLength,
            content_sha256: contentSha256,
            source_modified_at: child.modifiedTime ?? null,
            active: true,
            imported_at: new Date().toISOString()
          });
        } catch (error) {
          skipped += 1;
          errors.push(`${child.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    let staleIds: string[] = [];
    const nextImageOffset = imageOffset + processedImages;
    const hasMore = !body.dryRun && nextImageOffset < totalImages;
    if (!body.dryRun) {
      for (const rowChunk of chunk(rows, 100)) {
        const { error } = await supabase
          .from('wheel_catalog_items')
          .upsert(rowChunk, { onConflict: 'drive_file_id' });
        if (error) throw error;
      }

      if (!hasMore) {
        const foundIds = new Set(allDriveImageIds);
        const existing = await fetchActiveRowsForSources(supabase, deactivateSourceRootFolderIds);

        staleIds = existing
          .map((row) => row.drive_file_id as string)
          .filter((id) => !foundIds.has(id));
        for (const staleChunk of chunk(staleIds, 100)) {
          const { error } = await supabase
            .from('wheel_catalog_items')
            .update({ active: false })
            .in('drive_file_id', staleChunk);
          if (error) throw error;
        }
      }
    }

    const { error: syncRunUpdateError } = await supabase
      .from('wheel_catalog_sync_runs')
      .update({
        status: errors.length ? 'failed' : 'completed',
        completed_at: new Date().toISOString(),
        files_scanned: scanned,
        files_uploaded: body.dryRun ? 0 : rows.length,
        files_skipped: skipped,
        files_failed: errors.length,
        rows_deactivated: staleIds.length,
        error_message: body.dryRun
          ? `Dry run completed. ${dryRunImages} image files discovered; no storage or database rows changed.`
          : hasMore
            ? `Batch completed. Processed ${processedImages} of ${totalImages} Drive images; next offset ${nextImageOffset}.`
            : errors.length ? errors.slice(0, 20).join('\n') : null
      })
      .eq('id', syncRun.id);
    if (syncRunUpdateError) throw syncRunUpdateError;

    const result: SyncResult = {
      ok: errors.length === 0,
      scanned,
      imported: rows.length,
      skipped,
      deactivated: staleIds.length,
      rootFolderId,
      errors: errors.slice(0, 20),
      totalImages,
      processedImages,
      nextImageOffset,
      hasMore,
      imageOffset,
      imageLimit,
      ...(body.dryRun ? { dryRun: true, dryRunImages } : {})
    };
    return jsonResponse(result, errors.length ? 207 : 200);
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});
