import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const INPUT_PATH = resolve(process.env.WHEEL_CATALOG_CHROME_OCR_RAW || 'reports/wheel-catalog-chrome-ocr-raw.json');
const JSON_OUTPUT = resolve(process.env.WHEEL_CATALOG_ANALYSIS_JSON || 'reports/wheel-catalog-chrome-ocr-analysis.json');
const CSV_OUTPUT = resolve(process.env.WHEEL_CATALOG_ANALYSIS_CSV || 'reports/wheel-catalog-chrome-ocr-analysis.csv');
const COMPLETED_ONLY = process.env.WHEEL_CATALOG_CHROME_OCR_COMPLETED_ONLY === '1';
const EXPECTED_TOTAL = Number(process.env.WHEEL_CATALOG_CHROME_OCR_EXPECTED_TOTAL || 2036);

const unique = (values) => Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)));
const normalizePcd = (value) => {
  const match = String(value ?? '').toUpperCase().replace(/\//g, 'X').replace(/\s+/g, '').match(/\b([456])X?(\d{3}(?:\.\d)?)\b/);
  return match ? `${match[1]}X${match[2]}` : '';
};
const extractPcds = (text) => {
  const normalized = String(text ?? '').toUpperCase().replace(/×/g, 'X');
  const values = [];
  for (const match of normalized.matchAll(/\b(8|10|12)\s*X\s*(\d{3}(?:\.\d)?)\s*\/\s*(\d{3}(?:\.\d)?)/g)) {
    const studs = Number(match[1]) / 2;
    values.push(`${studs}X${match[2]}`, `${studs}X${match[3]}`);
  }
  for (const match of normalized.matchAll(/\b([456])\s*[X\/]\s*(\d{3}(?:\.\d)?)/g)) values.push(`${match[1]}X${match[2]}`);
  return unique(values);
};
const normalizeSize = (value) => String(value ?? '').toUpperCase().replace(/×/g, 'X').replace(/\s+/g, '');
const findModel = (tokens) => {
  const index = tokens.findIndex((token) => /^MODEL:?$/i.test(token));
  if (index < 0) return '';
  const values = [];
  for (const token of tokens.slice(index + 1, index + 4)) {
    if (/^(?:PCD|ET|CB|BLACK|SILVER|GUNMETAL|BRONZE|GLOSS|MATTE|MACHINED?)$/i.test(token) || /\d{2}X\d/i.test(token)) break;
    values.push(token);
  }
  return values.join(' ').trim();
};
const knownBrands = ['A-LINE', 'LENSO', 'BBS', 'ROTIFORM', 'BLACK RHINO', 'VOSSEN', 'TSW', 'XXR', 'ENKEI', 'MOMO', 'FUEL', 'METHOD', 'RAYS', 'ADVANTI', 'OZ RACING'];
const findBrand = (tokens, text) => {
  const index = tokens.findIndex((token) => /^BRAND:?$/i.test(token));
  if (index >= 0 && tokens[index + 1]) return tokens[index + 1];
  return knownBrands.find((brand) => new RegExp(`\\b${brand.replace('-', '[- ]?')}\\b`, 'i').test(text)) || '';
};
const findFinish = (text, size) => {
  const upper = text.toUpperCase();
  const sizeIndex = size ? upper.indexOf(size) : -1;
  const pcdIndex = upper.search(/\bPCD\b/);
  if (sizeIndex >= 0 && pcdIndex > sizeIndex) {
    const candidate = text.slice(sizeIndex + size.length, pcdIndex).replace(/^\s*J?\s*/, '').trim();
    const finishStart = candidate.search(/\b(?:GLOSS|MATTE|SATIN|BLACK|SILVER|GUNMETAL|BRONZE|GOLD|CHROME|MACHIN(?:E|ED))\b/i);
    const cleaned = finishStart >= 0 ? candidate.slice(finishStart).trim() : '';
    if (cleaned && cleaned.length <= 100) return cleaned;
  }
  return unique([
    /\b(?:GLOSS|MATTE|SATIN)\s+BLACK\b/i.exec(text)?.[0],
    /\bBLACK\s+MACHIN(?:E|ED)\s+FACE\b/i.exec(text)?.[0],
    /\bMACHIN(?:E|ED)\s+FACE\b/i.exec(text)?.[0],
    /\bGUNMETAL\b/i.exec(text)?.[0], /\bSILVER\b/i.exec(text)?.[0],
    /\bBRONZE\b/i.exec(text)?.[0], /\bCHROME\b/i.exec(text)?.[0]
  ]).join(' ');
};
const findColour = (finish, text) => unique(['BLACK', 'SILVER', 'GUNMETAL', 'BRONZE', 'GOLD', 'RED', 'BLUE', 'WHITE', 'CHROME']
  .filter((colour) => new RegExp(`\\b${colour}\\b`, 'i').test(`${finish} ${text}`))).join('/');
const vehicleHints = (fileName) => {
  const stem = String(fileName ?? '').replace(/\.[^.]+$/, '').replace(/\bIMG[-_ ]?\d.*$/i, '').replace(/\bWA\d+.*$/i, '');
  return unique(stem.split(/\s+-\s+|\s{2,}/).map((value) => value.replace(/^\d{2}\s+/, '').trim()).filter((value) => /[A-Za-z]/.test(value)));
};
const csvEscape = (value) => {
  const text = Array.isArray(value) ? value.join('|') : String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const raw = JSON.parse(await readFile(INPUT_PATH, 'utf8'));
const sourceItems = COMPLETED_ONLY
  ? (raw.items ?? []).filter((source) => source.status === 'completed')
  : (raw.items ?? []);
const items = sourceItems.map((source) => {
  const tokens = unique(source.ocrTokens ?? []);
  const visibleText = tokens.join(' ').replace(/\s+/g, ' ').trim();
  const folderPcd = normalizePcd(source.pcd);
  const detectedPcds = extractPcds(visibleText);
  const pcd = folderPcd || detectedPcds[0] || '';
  const pcdAliases = detectedPcds.filter((value) => value !== pcd);
  const sizeMatch = visibleText.match(/\b(1[3-9]|2[0-6])\s*[X×]\s*(\d+(?:\.\d+)?)\s*J?\b/i);
  const size = sizeMatch ? normalizeSize(`${sizeMatch[1]}X${sizeMatch[2]}J`) : '';
  const diameter = sizeMatch?.[1] || String(source.rimSize ?? '');
  const width = sizeMatch ? `${sizeMatch[2]}J` : '';
  const model = findModel(tokens);
  const brand = findBrand(tokens, visibleText);
  const finish = findFinish(visibleText, size);
  const colour = findColour(finish, visibleText);
  const offset = visibleText.match(/\bET\s*[:#-]?\s*(-?\d{1,3})\b/i)?.[1] || '';
  const centerBore = visibleText.match(/\b(?:CB|CENT(?:ER|RE)\s*BORE)\s*[:#-]?\s*(\d{2,3}(?:\.\d+)?)\b/i)?.[1] || '';
  const loadRating = visibleText.match(/\b(\d{3,4})\s*KG\b/i)?.[1] || '';
  const reasons = unique([
    source.status !== 'completed' ? (source.error || 'Chrome Lens OCR did not complete') : '',
    !visibleText ? 'OCR returned no visible text' : '',
    !pcd ? 'PCD not visible or present in folder path' : '',
    !size && !diameter ? 'Size not visible or present in folder path' : '',
    detectedPcds.length > 1 ? 'Multiple PCDs detected' : '',
    folderPcd && detectedPcds.length && !detectedPcds.includes(folderPcd) ? `Folder PCD ${folderPcd} conflicts with image OCR` : '',
    tokens.filter((token) => /^MODEL:?$/i.test(token)).length > 1 ? 'Catalog sheet contains multiple wheels' : ''
  ]);
  const confidence = Math.min(0.99, Number((0.35 + (visibleText ? 0.15 : 0) + (pcd ? 0.15 : 0) + (size || diameter ? 0.15 : 0) + (model ? 0.1 : 0) + (finish ? 0.1 : 0)).toFixed(2)));
  const hints = vehicleHints(source.fileName);
  const wheelSpecs = unique([model && `Model ${model}`, size, pcd, pcdAliases.join('/'), finish, offset && `ET${offset}`, centerBore && `CB${centerBore}`]).join(', ');
  const searchTags = unique([...(source.tags ?? []), brand, model, pcd, ...pcdAliases, size, diameter, width, finish, colour, ...hints, source.folderPath, source.fileName?.replace(/\.[^.]+$/, '')]).map((value) => value.toUpperCase());
  return {
    driveFileId: source.driveFileId || '', sourcePath: source.sourcePath || '', fileName: source.fileName || '',
    brand, model, pcd, pcdAliases, size, diameter, width, finish, colour, offset, centerBore, loadRating,
    vehicleHints: hints, visibleText, wheelSpecs, searchTags, confidence,
    needsReview: reasons.length > 0, reviewReason: reasons.join('; ')
  };
});

const columns = [
  ['Drive File ID', 'driveFileId'], ['Source Path', 'sourcePath'], ['File Name', 'fileName'], ['Brand', 'brand'],
  ['Model', 'model'], ['PCD', 'pcd'], ['PCD Aliases', 'pcdAliases'], ['Size', 'size'], ['Diameter', 'diameter'],
  ['Width', 'width'], ['Finish', 'finish'], ['Colour', 'colour'], ['Offset', 'offset'], ['Center Bore', 'centerBore'],
  ['Load Rating', 'loadRating'], ['Vehicle Hints', 'vehicleHints'], ['Visible Text', 'visibleText'], ['Wheel Specs', 'wheelSpecs'],
  ['Search Tags', 'searchTags'], ['Confidence', 'confidence'], ['Needs Review', 'needsReview'], ['Review Reason', 'reviewReason']
];
const summary = {
  ok: items.length === EXPECTED_TOTAL && items.every((item) => item.driveFileId),
  processed: items.length,
  needsReview: items.filter((item) => item.needsReview).length,
  ocrCompleted: sourceItems.filter((item) => item.status === 'completed').length,
  ocrFailed: sourceItems.filter((item) => item.status !== 'completed').length
};

await mkdir(dirname(JSON_OUTPUT), { recursive: true });
await mkdir(dirname(CSV_OUTPUT), { recursive: true });
await writeFile(JSON_OUTPUT, JSON.stringify({
  catalogSource: 'Google Drive Wheel Catalog',
  analysisMethod: `${raw.ocrProvider || 'Google Lens via Chrome'} with deterministic Codex normalization`,
  folderUrl: 'https://drive.google.com/drive/folders/15MhCztz6IvUXem2okdZkd13zHtdvzCKx?usp=drive_link',
  generatedAt: new Date().toISOString(), summary, items
}, null, 2));
await writeFile(CSV_OUTPUT, [columns.map(([label]) => csvEscape(label)).join(','), ...items.map((item) => columns.map(([, key]) => csvEscape(item[key])).join(','))].join('\n'));

console.log(JSON.stringify({ ...summary, json: JSON_OUTPUT, csv: CSV_OUTPUT }, null, 2));
process.exit(summary.ok ? 0 : 1);
