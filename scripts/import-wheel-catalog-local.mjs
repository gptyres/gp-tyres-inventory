import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { glob } from 'node:fs/promises';

const DEFAULT_ROOT = 'C:/Users/User/Desktop/WHEEL CATALOG 2026 Q3_LIVE';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://moiybakshvuvppesbnpt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_CmagmxnGcxu9bGWdwWfwjQ_2y_ZXw9j';
const IMPORT_TOKEN = process.env.WHEEL_CATALOG_IMPORT_TOKEN;
const SOURCE_ROOT_FOLDER_ID = process.env.WHEEL_CATALOG_ROOT_ID || 'local-wheel-catalog-2026-q3-live';
const SOURCE_LABEL = process.env.WHEEL_CATALOG_SOURCE_LABEL || 'WHEEL CATALOG 2026 Q3_LIVE';
const BUCKET_NAME = 'wheel-catalog-images';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const IMPORT_CONCURRENCY = Math.max(1, Number.parseInt(process.env.WHEEL_CATALOG_IMPORT_CONCURRENCY || '6', 10));

const rootArg = process.argv[2] || DEFAULT_ROOT;
const rootDir = isAbsolute(rootArg) ? resolve(rootArg) : resolve(rootArg);

if (!IMPORT_TOKEN) {
  console.error('Missing WHEEL_CATALOG_IMPORT_TOKEN.');
  process.exit(1);
}

const normalize = (value) => value.replace(/\s+/g, ' ').trim();
const normalizeRelativePath = (value) => value.split(/[\\/]/).map(normalize).filter(Boolean).join('/');
const hashText = (value) => createHash('sha256').update(value).digest('hex');
const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
const isIgnoredFolder = (value) => normalize(value).startsWith('_');
const isUpdatedFolder = (value) => /^UPDATED(?:\b|\s|\()/i.test(normalize(value));

const parseCatalogMetadata = (folderPathParts, fileName) => {
  const text = normalize([...folderPathParts, fileName].join(' ')).replace(/\u00d7/g, 'x');
  const rimMatch = text.match(/\b(1[3-9]|2[0-6])\s*(?:inch|inches|in|")?\b/i);
  const pcdMatch = text.match(/\b([456])\s*x\s*(\d{3}(?:\.\d)?)\b/i)
    ?? text.match(/\b([456])(\d{3})\b/i);
  const tags = Array.from(
    new Set(
      [...folderPathParts, fileName.replace(extname(fileName), '')]
        .flatMap((part) => normalize(part).split(/[\s_-]+/))
        .map((tag) => tag.replace(/[^a-z0-9.]+/gi, '').toUpperCase())
        .filter((tag) => tag.length > 1 && tag !== 'UPDATED' && tag !== 'INCH')
    )
  );

  return {
    rimSize: rimMatch ? rimMatch[1] : null,
    pcd: pcdMatch ? `${pcdMatch[1]}X${pcdMatch[2]}`.toUpperCase() : null,
    category: folderPathParts.find((part) => !isUpdatedFolder(part)) || null,
    tags
  };
};

const mimeFor = (fileName) => {
  const ext = extname(fileName).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
};

const toStoragePath = (relativePath, contentSha256, fileName) => {
  const ext = extname(fileName).toLowerCase() || '.jpg';
  const pathHash = hashText(relativePath).slice(0, 24);
  return `local-import/${pathHash}/${contentSha256}${ext}`;
};

const invokeImport = async (payload, options = {}) => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/import-wheel-catalog-local`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'x-wheel-catalog-import-token': IMPORT_TOKEN
    },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));
  if ((!response.ok || body.ok === false) && !options.allowFailure) {
    throw new Error(body.error || `Import failed with HTTP ${response.status}`);
  }
  return body;
};

const startImport = async () => {
  return await invokeImport({
    action: 'start',
    sourceRootFolderId: SOURCE_ROOT_FOLDER_ID,
    sourceLabel: SOURCE_LABEL
  });
};

const finalizeImport = async (importRunId, seenDriveFileIds, counts) => {
  return await invokeImport({
    action: 'finalize',
    importRunId,
    sourceRootFolderId: SOURCE_ROOT_FOLDER_ID,
    seenDriveFileIds,
    ...counts
  }, { allowFailure: true });
};

const allImageFiles = [];
for await (const entry of glob('**/*', { cwd: rootDir, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const absolutePath = `${entry.parentPath}${sep}${entry.name}`;
  const extension = extname(entry.name).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) continue;
  allImageFiles.push(absolutePath);
}

const files = allImageFiles.filter((absolutePath) => {
  const rel = normalizeRelativePath(relative(rootDir, absolutePath));
  const parts = rel.split('/').slice(0, -1);
  return !parts.some(isIgnoredFolder);
});

files.sort((a, b) => a.localeCompare(b));

console.log(`Found ${allImageFiles.length} image file(s) under ${rootDir}`);
console.log(`Skipped ${allImageFiles.length - files.length} image file(s) in review/system folders`);
console.log(`Importing ${files.length} customer-ready image file(s)`);
console.log(`Import concurrency: ${IMPORT_CONCURRENCY}`);

const startResult = await startImport();
if (!startResult.ok || !startResult.importRunId) {
  throw new Error(startResult.error || 'Could not start wheel catalog import.');
}

let imported = 0;
let failed = 0;
let nextIndex = 0;
const seenDriveFileIds = [];

const importOne = async (absolutePath) => {
  const fileName = absolutePath.split(/[\\/]/).at(-1);
  const rel = normalizeRelativePath(relative(rootDir, absolutePath));
  const rawFolderPathParts = rel.split('/').slice(0, -1).map(normalize).filter(Boolean);
  const folderPathParts = rawFolderPathParts.filter((part) => !isUpdatedFolder(part));
  const folderPath = folderPathParts.join(' / ');
  const bytes = await readFile(absolutePath);
  const contentSha256 = hashBytes(bytes);
  const driveFileId = `local-${hashText(rel)}`;
  const sourceStats = await stat(absolutePath);
  const metadata = parseCatalogMetadata(rawFolderPathParts, fileName);
  const storagePath = toStoragePath(rel, contentSha256, fileName);

  try {
    await invokeImport({
      action: 'import',
      importRunId: startResult.importRunId,
      sourceRootFolderId: SOURCE_ROOT_FOLDER_ID,
      sourceLabel: SOURCE_LABEL,
      driveFileId,
      driveFolderId: null,
      folderPath,
      folderPathParts,
      category: metadata.category,
      rimSize: metadata.rimSize,
      pcd: metadata.pcd,
      tags: Array.from(new Set([
        ...metadata.tags,
        ...rawFolderPathParts.filter(isUpdatedFolder).map((part) => `folder:${part}`)
      ])),
      fileName,
      driveUrl: `local://${rel}`,
      storageBucket: BUCKET_NAME,
      storagePath,
      mimeType: mimeFor(fileName),
      localRelativePath: rel,
      sourceSizeBytes: sourceStats.size,
      contentSha256,
      sourceModifiedAt: sourceStats.mtime.toISOString(),
      base64: bytes.toString('base64')
    });
    seenDriveFileIds.push(driveFileId);
    imported += 1;
    if (imported % 25 === 0 || imported === files.length) {
      console.log(`Imported ${imported}/${files.length} (${failed} failed)`);
    }
  } catch (error) {
    failed += 1;
    console.error(`Failed: ${rel}: ${error.message}`);
  }
};

const worker = async () => {
  while (nextIndex < files.length) {
    const index = nextIndex;
    nextIndex += 1;
    await importOne(files[index]);
  }
};

await Promise.all(
  Array.from({ length: Math.min(IMPORT_CONCURRENCY, files.length) }, () => worker())
);

const finalizeResult = await finalizeImport(startResult.importRunId, seenDriveFileIds, {
  filesScanned: allImageFiles.length,
  filesUploaded: imported,
  filesSkipped: allImageFiles.length - files.length,
  filesFailed: failed,
  errorMessage: failed ? `${failed} image file(s) failed during import.` : null
});

console.log(JSON.stringify({
  ok: failed === 0 && finalizeResult.ok !== false,
  importRunId: startResult.importRunId,
  found: allImageFiles.length,
  imported,
  skipped: allImageFiles.length - files.length,
  failed,
  finalized: Boolean(finalizeResult),
  deactivated: finalizeResult?.deactivated ?? 0
}, null, 2));
process.exit(failed === 0 ? 0 : 1);
