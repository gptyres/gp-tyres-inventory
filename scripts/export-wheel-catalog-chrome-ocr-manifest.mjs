import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const loadLocalEnv = async () => {
  const envPath = resolve('.env.local');
  if (!existsSync(envPath)) return;
  const text = await readFile(envPath, 'utf8');
  text.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]]) return;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  });
};

await loadLocalEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://moiybakshvuvppesbnpt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_CmagmxnGcxu9bGWdwWfwjQ_2y_ZXw9j';
const SOURCE_ROOT_FOLDER_ID = '15MhCztz6IvUXem2okdZkd13zHtdvzCKx';
const OUTPUT_PATH = resolve(process.env.WHEEL_CATALOG_CHROME_OCR_MANIFEST || 'reports/wheel-catalog-chrome-ocr-manifest.json');
const PAGE_SIZE = 1000;

const rows = [];
for (let from = 0; ; from += PAGE_SIZE) {
  const query = new URLSearchParams({
    select: 'drive_file_id,file_name,folder_path,local_relative_path,rim_size,pcd,public_image_url,mime_type',
    active: 'eq.true',
    source_root_folder_id: `eq.${SOURCE_ROOT_FOLDER_ID}`,
    order: 'folder_path.asc,file_name.asc'
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/wheel_catalog_items?${query}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Range: `${from}-${from + PAGE_SIZE - 1}`
    }
  });
  if (!response.ok) throw new Error(`Catalog manifest request failed with HTTP ${response.status}.`);
  const page = await response.json();
  rows.push(...page);
  if (page.length < PAGE_SIZE) break;
}

const items = rows.map((row) => ({
  driveFileId: row.drive_file_id,
  sourcePath: row.local_relative_path || [row.folder_path, row.file_name].filter(Boolean).join('/'),
  fileName: row.file_name,
  folderPath: row.folder_path,
  rimSize: row.rim_size,
  pcd: row.pcd,
  imageUrl: row.public_image_url,
  mimeType: row.mime_type
}));

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, JSON.stringify({
  sourceRootFolderId: SOURCE_ROOT_FOLDER_ID,
  generatedAt: new Date().toISOString(),
  total: items.length,
  items
}, null, 2));

console.log(JSON.stringify({ ok: items.length === 2036, total: items.length, output: OUTPUT_PATH }, null, 2));
process.exit(items.length === 2036 ? 0 : 1);
