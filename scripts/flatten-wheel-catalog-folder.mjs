import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';

const DEFAULT_ROOT = 'C:/Users/User/Desktop/WHEEL CATALOG 2026 Q3_QUARANTINE';
const DEFAULT_REPORT = 'reports/wheel-catalog-quarantine-flatten-report.json';
const DEFAULT_CSV = 'reports/wheel-catalog-quarantine-flatten-report.csv';
const REVIEW_FOLDER = '_NEEDS_PCD_REVIEW';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const MONTH_NAMES = new Map([
  [1, 'JANUARY'],
  [2, 'FEBRUARY'],
  [3, 'MARCH'],
  [4, 'APRIL'],
  [5, 'MAY'],
  [6, 'JUNE'],
  [7, 'JULY'],
  [8, 'AUGUST'],
  [9, 'SEPTEMBER'],
  [10, 'OCTOBER'],
  [11, 'NOVEMBER'],
  [12, 'DECEMBER']
]);
const MONTH_LOOKUP = new Map([
  ['JAN', 1],
  ['JANUARY', 1],
  ['FEB', 2],
  ['FEBRUARY', 2],
  ['MAR', 3],
  ['MARCH', 3],
  ['APR', 4],
  ['APRIL', 4],
  ['MAY', 5],
  ['JUN', 6],
  ['JUNE', 6],
  ['JUL', 7],
  ['JULY', 7],
  ['AUG', 8],
  ['AUGUST', 8],
  ['SEP', 9],
  ['SEPT', 9],
  ['SEPTEMBER', 9],
  ['OCT', 10],
  ['OCTOBER', 10],
  ['NOV', 11],
  ['NOVEMBER', 11],
  ['DEC', 12],
  ['DECEMBER', 12]
]);

const args = process.argv.slice(2);
const readOption = (name, fallback) => {
  const prefix = `--${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
};
const hasFlag = (name) => args.includes(`--${name}`);

const rootDir = resolve(readOption('root', process.env.WHEEL_CATALOG_FLATTEN_ROOT || DEFAULT_ROOT));
const reportPath = resolve(readOption('report', process.env.WHEEL_CATALOG_FLATTEN_REPORT || DEFAULT_REPORT));
const csvPath = resolve(readOption('csv', process.env.WHEEL_CATALOG_FLATTEN_CSV || DEFAULT_CSV));
const dryRun = hasFlag('dry-run');

const normalizeText = (value = '') => value
  .replace(/\u00a0/g, ' ')
  .replace(/\u00d7/g, 'x')
  .replace(/\s+/g, ' ')
  .trim();

const sanitizeNamePart = (value) => normalizeText(value)
  .replace(/[<>:"/\\|?*]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const isImageFile = (fileName) => IMAGE_EXTENSIONS.has(extname(fileName).toLowerCase());
const isUpdatedFolder = (value) => /^(UPD(?:AT|SAT)?ED|UPDATE)(?:\b|\s|\()/i.test(normalizeText(value));

const parseUpdatedLabel = (value) => {
  const normalized = normalizeText(value).toUpperCase();
  if (!isUpdatedFolder(normalized)) return '';

  const numeric = normalized.match(/\b(\d{1,2})[.\-_/](\d{1,2})(?:[.\-_/](\d{2,4}))?\b/);
  if (numeric) {
    const day = Number.parseInt(numeric[1], 10);
    const month = Number.parseInt(numeric[2], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `UPDATED ${day} ${MONTH_NAMES.get(month)}`;
    }
  }

  const fullMonth = normalized.match(/\b(\d{1,2})\s+(JANUARY|JAN|FEBRUARY|FEB|MARCH|MAR|APRIL|APR|MAY|JUNE|JUN|JULY|JUL|AUGUST|AUG|SEPTEMBER|SEPT|SEP|OCTOBER|OCT|NOVEMBER|NOV|DECEMBER|DEC)\b/);
  if (fullMonth) {
    const day = Number.parseInt(fullMonth[1], 10);
    const month = MONTH_LOOKUP.get(fullMonth[2]);
    if (day >= 1 && day <= 31 && month) return `UPDATED ${day} ${MONTH_NAMES.get(month)}`;
  }

  const monthWord = normalized.match(/\b(JANUARY|JAN|FEBRUARY|FEB|MARCH|MAR|APRIL|APR|MAY|JUNE|JUN|JULY|JUL|AUGUST|AUG|SEPTEMBER|SEPT|SEP|OCTOBER|OCT|NOVEMBER|NOV|DECEMBER|DEC)\b/);
  if (monthWord) return `UPDATED ${MONTH_NAMES.get(MONTH_LOOKUP.get(monthWord[1]))}`;

  return 'UPDATED';
};

const parseSizePcd = (text) => {
  const normalized = normalizeText(text);
  const sizeMatch = normalized.match(/\b(1[3-9]|2[0-6])\s*(?:INCH|INCHES|IN|")?\b/i)
    ?? normalized.match(/\b(1[3-9]|2[0-6])x[3456]\d{3}\b/i);
  const pcdMatch = normalized.match(/\b([3456])\s*x+\s*(\d{3}(?:\.3)?)\b/i)
    ?? normalized.match(/\b(?:1[3-9]|2[0-6])x([3456])(\d{3})\b/i)
    ?? normalized.match(/\b([3456])(\d{3})\b/i);

  if (!sizeMatch || !pcdMatch) return null;
  return {
    rimSize: sizeMatch[1],
    pcd: `${pcdMatch[1]}X${pcdMatch[2]}`,
    folder: `${sizeMatch[1]} ${pcdMatch[1]}X${pcdMatch[2]}`.toUpperCase()
  };
};

const descriptorFromPart = (part, parsed) => {
  if (isUpdatedFolder(part)) return '';
  let value = normalizeText(part).toUpperCase();
  value = value
    .replace(new RegExp(`\\b${parsed.rimSize}\\s*(?:INCH|INCHES|IN|")?\\b`, 'ig'), ' ')
    .replace(/\b(?:INCH|INCHES|RIMS?|MAGS?|PCD)\b/ig, ' ')
    .replace(/\b[3456]\s*x+\s*\d{3}(?:\.3)?\b/ig, ' ')
    .replace(/\b[3456]\d{3}\b/ig, ' ')
    .replace(/\b(?:UPDATED|UPDATE|NEW|FOLDER)\b/ig, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitizeNamePart(value);
};

const walkFiles = async (directory) => {
  const files = [];
  const walk = async (current) => {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && isImageFile(entry.name)) {
        files.push(fullPath);
      }
    }
  };
  await walk(directory);
  return files.sort((first, second) => first.localeCompare(second));
};

const uniquePathFor = (destinationPath, reserved) => {
  const extension = extname(destinationPath);
  const base = extension ? destinationPath.slice(0, -extension.length) : destinationPath;
  let candidate = destinationPath;
  let index = 2;
  while (reserved.has(candidate.toLowerCase())) {
    candidate = `${base} (${index})${extension}`;
    index += 1;
  }
  reserved.add(candidate.toLowerCase());
  return candidate;
};

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

const writeReports = async (report) => {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const headers = [
    'action',
    'sourceRelativePath',
    'destinationRelativePath',
    'rimSize',
    'pcd',
    'descriptorTags',
    'updatedTags'
  ];
  const rows = report.entries.map((entry) => headers.map((header) => csvCell(
    Array.isArray(entry[header]) ? entry[header].join('; ') : entry[header]
  )).join(','));
  await mkdir(dirname(csvPath), { recursive: true });
  await writeFile(csvPath, `${headers.join(',')}\n${rows.join('\n')}\n`, 'utf8');
};

const removeEmptyFolders = async (directory) => {
  let removed = 0;
  const walk = async (current) => {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) await walk(join(current, entry.name));
    }
    if (current === directory) return;
    const remaining = await readdir(current);
    if (!remaining.length) {
      removed += 1;
      if (!dryRun) await rm(current, { recursive: true, force: true });
    }
  };
  await walk(directory);
  return removed;
};

const buildFlattenReport = async () => {
  const files = await walkFiles(rootDir);
  const reservedDestinations = new Set();
  const entries = [];

  for (const sourcePath of files) {
    const sourceRelativePath = relative(rootDir, sourcePath);
    const parts = sourceRelativePath.split(/[\\/]/);
    const fileName = parts.at(-1) ?? '';
    const folderParts = parts.slice(0, -1).map(normalizeText).filter(Boolean);
    const searchText = [...folderParts, fileName].join(' ');
    const parsed = parseSizePcd(searchText);
    const updatedTags = Array.from(new Set(folderParts.map(parseUpdatedLabel).filter(Boolean)));

    if (!parsed) {
      const prefixParts = [
        ...folderParts.filter((part) => !isUpdatedFolder(part)).map((part) => sanitizeNamePart(part.toUpperCase())).filter(Boolean),
        ...updatedTags
      ];
      const destinationFileName = [...prefixParts, fileName].filter(Boolean).join(' - ');
      const plannedDestination = join(rootDir, REVIEW_FOLDER, destinationFileName);
      const destinationPath = uniquePathFor(plannedDestination, reservedDestinations);
      entries.push({
        action: destinationPath === plannedDestination ? 'needs_review' : 'collision_rename',
        sourcePath,
        sourceRelativePath,
        destinationPath,
        destinationRelativePath: relative(rootDir, destinationPath),
        rimSize: null,
        pcd: null,
        descriptorTags: folderParts.filter((part) => !isUpdatedFolder(part)),
        updatedTags
      });
      continue;
    }

    const descriptorTags = Array.from(new Set(
      folderParts
        .map((part) => descriptorFromPart(part, parsed))
        .filter(Boolean)
    ));
    const prefixParts = [...descriptorTags, ...updatedTags];
    const destinationFileName = [...prefixParts, fileName].filter(Boolean).join(' - ');
    const plannedDestination = join(rootDir, parsed.folder, destinationFileName);
    const destinationPath = uniquePathFor(plannedDestination, reservedDestinations);
    const sourceAlreadyFinal = sourcePath.toLowerCase() === destinationPath.toLowerCase();
    entries.push({
      action: sourceAlreadyFinal
        ? 'keep'
        : destinationPath === plannedDestination
          ? 'move'
          : 'collision_rename',
      sourcePath,
      sourceRelativePath,
      destinationPath,
      destinationRelativePath: relative(rootDir, destinationPath),
      rimSize: parsed.rimSize,
      pcd: parsed.pcd,
      descriptorTags,
      updatedTags
    });
  }

  const summary = entries.reduce((counts, entry) => {
    counts[entry.action] = (counts[entry.action] ?? 0) + 1;
    return counts;
  }, {});

  return {
    generatedAt: new Date().toISOString(),
    rootDir,
    dryRun,
    reviewFolder: REVIEW_FOLDER,
    summary: {
      totalImages: entries.length,
      keep: summary.keep ?? 0,
      move: summary.move ?? 0,
      collisionRename: summary.collision_rename ?? 0,
      needsReview: summary.needs_review ?? 0
    },
    entries
  };
};

const applyFlattenReport = async (report) => {
  const entriesToMove = report.entries
    .filter((entry) => entry.action !== 'keep')
    .sort((first, second) => second.sourcePath.length - first.sourcePath.length);

  for (const entry of entriesToMove) {
    if (entry.sourcePath === entry.destinationPath) continue;
    await mkdir(dirname(entry.destinationPath), { recursive: true });
    await rename(entry.sourcePath, entry.destinationPath);
  }

  return await removeEmptyFolders(rootDir);
};

const report = await buildFlattenReport();
if (!dryRun) {
  report.removedEmptyFolders = await applyFlattenReport(report);
} else {
  report.removedEmptyFolders = 0;
}
await writeReports(report);

console.log(JSON.stringify({
  ok: true,
  dryRun,
  rootDir,
  reportPath,
  csvPath,
  summary: report.summary,
  removedEmptyFolders: report.removedEmptyFolders
}, null, 2));
