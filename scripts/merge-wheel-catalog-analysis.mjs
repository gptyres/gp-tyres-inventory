import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const INPUT_PATHS = (process.env.WHEEL_CATALOG_ANALYSIS_SHARD_FILES || [
  'reports/wheel-catalog-image-analysis-v2-shard-0.json',
  'reports/wheel-catalog-image-analysis-v2-shard-1.json'
].join(','))
  .split(',')
  .map((value) => resolve(value.trim()))
  .filter(Boolean);
const JSON_OUTPUT = resolve(process.env.WHEEL_CATALOG_ANALYSIS_JSON || 'reports/wheel-catalog-image-analysis-v2-final.json');
const CSV_OUTPUT = resolve(process.env.WHEEL_CATALOG_ANALYSIS_CSV || 'reports/wheel-catalog-image-analysis-v2-final.csv');
const EXPECTED_ITEMS = Number.parseInt(process.env.WHEEL_CATALOG_ANALYSIS_EXPECTED_ITEMS || '2036', 10);

const csvEscape = (value) => {
  const text = Array.isArray(value) ? value.join('|') : String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const columns = [
  ['Drive File ID', 'driveFileId'], ['Source Path', 'sourcePath'], ['File Name', 'fileName'],
  ['Brand', 'brand'], ['Model', 'model'], ['PCD', 'pcd'], ['PCD Aliases', 'pcdAliases'],
  ['Size', 'size'], ['Diameter', 'diameter'], ['Width', 'width'], ['Finish', 'finish'],
  ['Colour', 'colour'], ['Offset', 'offset'], ['Center Bore', 'centerBore'],
  ['Load Rating', 'loadRating'], ['Vehicle Hints', 'vehicleHints'], ['Visible Text', 'visibleText'],
  ['Wheel Specs', 'wheelSpecs'], ['Search Tags', 'searchTags'], ['Confidence', 'confidence'],
  ['Needs Review', 'needsReview'], ['Review Reason', 'reviewReason']
];

const reports = await Promise.all(INPUT_PATHS.map(async (path) => JSON.parse(await readFile(path, 'utf8'))));
const merged = new Map();
for (const report of reports) {
  for (const item of report.items ?? []) {
    if (item?.driveFileId) merged.set(item.driveFileId, item);
  }
}

const items = Array.from(merged.values()).sort((left, right) => (
  String(left.sourcePath ?? '').localeCompare(String(right.sourcePath ?? ''), undefined, { numeric: true })
));
const summary = {
  ok: items.length === EXPECTED_ITEMS,
  expected: EXPECTED_ITEMS,
  processed: items.length,
  needsReview: items.filter((item) => item.needsReview).length,
  missing: Math.max(0, EXPECTED_ITEMS - items.length)
};

await mkdir(dirname(JSON_OUTPUT), { recursive: true });
await mkdir(dirname(CSV_OUTPUT), { recursive: true });
await writeFile(JSON_OUTPUT, JSON.stringify({
  catalogSource: 'Google Drive Wheel Catalog',
  folderUrl: 'https://drive.google.com/drive/folders/15MhCztz6IvUXem2okdZkd13zHtdvzCKx?usp=drive_link',
  generatedAt: new Date().toISOString(),
  summary,
  items
}, null, 2));
await writeFile(CSV_OUTPUT, [
  columns.map(([label]) => csvEscape(label)).join(','),
  ...items.map((item) => columns.map(([, key]) => csvEscape(item[key])).join(','))
].join('\n'));

console.log(JSON.stringify({ ...summary, json: JSON_OUTPUT, csv: CSV_OUTPUT }, null, 2));
process.exit(summary.ok ? 0 : 1);
