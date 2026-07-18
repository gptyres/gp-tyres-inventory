import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';

const DEFAULT_ROOT = 'C:/Users/User/Desktop/WHEEL CATALOG 2026 Q3';
const DEFAULT_REPORT = 'reports/wheel-catalog-folder-organization-report.json';
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

const rootDir = resolve(readOption('root', process.env.WHEEL_CATALOG_ROOT || DEFAULT_ROOT));
const reportPath = resolve(readOption('report', process.env.WHEEL_CATALOG_FOLDER_REPORT || DEFAULT_REPORT));
const dryRun = hasFlag('dry-run');
const report = {
  generatedAt: new Date().toISOString(),
  rootDir,
  dryRun,
  consolidatedUpdatedFolders: [],
  renamedUpdatedFolders: [],
  normalizedTopLevelFolders: [],
  deletedEmptyFolders: [],
  skippedTopLevelFolders: [],
  flattenedNestedUpdatedFolders: []
};

const normalizeText = (value = '') => value
  .replace(/\u00a0/g, ' ')
  .replace(/\u00d7/g, 'x')
  .replace(/\s+/g, ' ')
  .trim();

const isUpdatedFolder = (value) => /^(UPD(?:AT|SAT)?ED|UPDATE)(?:\b|\s|\()/i.test(normalizeText(value));

const parseUpdatedDate = (folderName, fallbackModifiedMs = 0) => {
  const value = normalizeText(folderName).toUpperCase();
  const numeric = value.match(/\b(\d{1,2})[.\-_/](\d{1,2})(?:[.\-_/](\d{2,4}))?\b/);
  if (numeric) {
    const day = Number.parseInt(numeric[1], 10);
    const month = Number.parseInt(numeric[2], 10);
    const rawYear = numeric[3] ? Number.parseInt(numeric[3], 10) : 2026;
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return {
        day,
        month,
        year,
        sortValue: year * 10000 + month * 100 + day,
        formatted: `UPDATED ${day} ${MONTH_NAMES.get(month)}`
      };
    }
  }

  const fullMonth = value.match(/\b(\d{1,2})\s+(JANUARY|JAN|FEBRUARY|FEB|MARCH|MAR|APRIL|APR|MAY|JUNE|JUN|JULY|JUL|AUGUST|AUG|SEPTEMBER|SEPT|SEP|OCTOBER|OCT|NOVEMBER|NOV|DECEMBER|DEC)\b/);
  if (fullMonth) {
    const day = Number.parseInt(fullMonth[1], 10);
    const month = MONTH_LOOKUP.get(fullMonth[2]);
    if (day >= 1 && day <= 31 && month) {
      return {
        day,
        month,
        year: 2026,
        sortValue: 2026 * 10000 + month * 100 + day,
        formatted: `UPDATED ${day} ${MONTH_NAMES.get(month)}`
      };
    }
  }

  const monthWord = value.match(/\b(JANUARY|JAN|FEBRUARY|FEB|MARCH|MAR|APRIL|APR|MAY|JUNE|JUN|JULY|JUL|AUGUST|AUG|SEPTEMBER|SEPT|SEP|OCTOBER|OCT|NOVEMBER|NOV|DECEMBER|DEC)\b/);
  if (monthWord) {
    const month = MONTH_LOOKUP.get(monthWord[1]);
    return {
      day: null,
      month,
      year: month === 12 ? 2025 : 2026,
      sortValue: (month === 12 ? 2025 : 2026) * 10000 + month * 100,
      formatted: `UPDATED ${MONTH_NAMES.get(month)}`
    };
  }

  return {
    day: null,
    month: null,
    year: null,
    sortValue: fallbackModifiedMs,
    formatted: 'UPDATED'
  };
};

const listDirectories = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => join(directory, entry.name));
};

const listAllDirectories = async (directory) => {
  const children = await listDirectories(directory);
  const nested = [];
  for (const child of children) {
    nested.push(child, ...await listAllDirectories(child));
  }
  return nested;
};

const hasAnyChildren = async (directory) => {
  const entries = await readdir(directory);
  return entries.length > 0;
};

const latestFileModifiedMs = async (directory) => {
  let latest = 0;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      latest = Math.max(latest, await latestFileModifiedMs(fullPath));
    } else if (entry.isFile()) {
      latest = Math.max(latest, (await stat(fullPath)).mtimeMs);
    }
  }
  return latest;
};

const uniqueDestination = async (destination) => {
  try {
    await stat(destination);
  } catch {
    return destination;
  }

  const extension = extname(destination);
  const base = extension ? destination.slice(0, -extension.length) : destination;
  for (let index = 2; index < 10000; index += 1) {
    const candidate = `${base} (${index})${extension}`;
    try {
      await stat(candidate);
    } catch {
      return candidate;
    }
  }
  throw new Error(`Could not find a unique destination for ${destination}`);
};

const moveContents = async (source, destination) => {
  const moves = [];
  if (!dryRun) await mkdir(destination, { recursive: true });

  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = join(source, entry.name);
    let destinationPath = join(destination, entry.name);
    if (!dryRun) destinationPath = await uniqueDestination(destinationPath);
    moves.push({ from: sourcePath, to: destinationPath });
    if (!dryRun) await rename(sourcePath, destinationPath);
  }
  return moves;
};

const renameOrMergeDirectory = async (source, destination) => {
  if (source === destination) return { mode: 'unchanged', moves: [] };
  if (source.toLowerCase() === destination.toLowerCase()) {
    const temporary = `${source}.__rename_tmp_${Date.now()}`;
    if (!dryRun) {
      await rename(source, temporary);
      await rename(temporary, destination);
    }
    return { mode: 'renamed', moves: [{ from: source, to: destination }] };
  }

  try {
    await stat(destination);
    const moves = await moveContents(source, destination);
    if (!dryRun) await rm(source, { recursive: true, force: true });
    return { mode: 'merged', moves };
  } catch {
    if (!dryRun) {
      await mkdir(dirname(destination), { recursive: true });
      try {
        await rename(source, destination);
      } catch (error) {
        if (error?.code !== 'EPERM' && error?.code !== 'EACCES') throw error;
        await mkdir(destination, { recursive: true });
        const moves = await moveContents(source, destination);
        await rm(source, { recursive: true, force: true });
        return { mode: 'merged', moves };
      }
    }
    return { mode: 'renamed', moves: [{ from: source, to: destination }] };
  }
};

const formatUpdatedFolders = async () => {
  const allDirectories = (await listAllDirectories(rootDir)).sort((first, second) => second.length - first.length);
  const updatedDirectories = [];
  for (const directory of allDirectories) {
    const name = directory.split(/[\\/]/).at(-1) ?? '';
    if (!isUpdatedFolder(name)) continue;
    updatedDirectories.push({
      path: directory,
      parent: dirname(directory),
      name,
      latestModifiedMs: await latestFileModifiedMs(directory)
    });
  }

  const byParent = new Map();
  for (const directory of updatedDirectories) {
    byParent.set(directory.parent, [...(byParent.get(directory.parent) ?? []), directory]);
  }

  for (const [parent, siblings] of byParent.entries()) {
    if (siblings.length <= 1) continue;
    const scored = siblings
      .map((directory) => ({ ...directory, parsed: parseUpdatedDate(directory.name, directory.latestModifiedMs) }))
      .sort((first, second) => (
        second.parsed.sortValue - first.parsed.sortValue
        || second.latestModifiedMs - first.latestModifiedMs
        || first.name.localeCompare(second.name)
      ));
    const winner = scored[0];
    for (const sibling of scored.slice(1)) {
      const moves = await moveContents(sibling.path, winner.path);
      report.consolidatedUpdatedFolders.push({
        kept: relative(rootDir, winner.path),
        removed: relative(rootDir, sibling.path),
        movedChildren: moves.length
      });
      if (!dryRun) await rm(sibling.path, { recursive: true, force: true });
    }
    report.consolidatedUpdatedFolders.push({
      parent: relative(rootDir, parent),
      kept: relative(rootDir, winner.path),
      removedSiblingCount: scored.length - 1
    });
  }

  const remainingUpdatedDirectories = (await listAllDirectories(rootDir))
    .filter((directory) => isUpdatedFolder(directory.split(/[\\/]/).at(-1) ?? ''))
    .sort((first, second) => second.length - first.length);

  for (const directory of remainingUpdatedDirectories) {
    const name = directory.split(/[\\/]/).at(-1) ?? '';
    const parsed = parseUpdatedDate(name, await latestFileModifiedMs(directory));
    if (name === parsed.formatted) continue;
    const destination = join(dirname(directory), parsed.formatted);
    const result = await renameOrMergeDirectory(directory, destination);
    report.renamedUpdatedFolders.push({
      from: relative(rootDir, directory),
      to: relative(rootDir, destination),
      mode: result.mode
    });
  }
};

const flattenNestedUpdatedFolders = async () => {
  const directories = (await listAllDirectories(rootDir))
    .filter((directory) => isUpdatedFolder(directory.split(/[\\/]/).at(-1) ?? ''))
    .sort((first, second) => second.length - first.length);

  for (const directory of directories) {
    const parent = dirname(directory);
    const parentName = parent.split(/[\\/]/).at(-1) ?? '';
    if (!isUpdatedFolder(parentName)) continue;

    const moves = await moveContents(directory, parent);
    report.flattenedNestedUpdatedFolders.push({
      from: relative(rootDir, directory),
      to: relative(rootDir, parent),
      movedChildren: moves.length
    });
    if (!dryRun) await rm(directory, { recursive: true, force: true });
  }
};

const normalizeTopLevelName = (name) => {
  const original = normalizeText(name);
  const searchable = original.replace(/\u00d7/g, 'x');
  const sizeMatch = searchable.match(/\b(1[3-9]|2[0-6])\s*(?:INCH|INCHES|IN|")?\b/i)
    ?? searchable.match(/\b(1[3-9]|2[0-6])x[3456]\d{3}\b/i);
  const pcdMatch = searchable.match(/\b([3456])\s*x+\s*(\d{3}(?:\.3)?)\b/i)
    ?? searchable.match(/\b(?:1[3-9]|2[0-6])x([3456])(\d{3})\b/i)
    ?? searchable.match(/\b([3456])(\d{3})\b/i);

  if (!sizeMatch || !pcdMatch) {
    return {
      target: null,
      changed: false,
      reason: 'Could not identify both size and PCD.'
    };
  }

  const size = sizeMatch[1];
  const pcd = `${pcdMatch[1]}X${pcdMatch[2]}`;
  let suffix = ` ${searchable} `;
  suffix = suffix
    .replace(new RegExp(`\\b${size}\\s*(?:INCH|INCHES|IN|")?\\b`, 'ig'), ' ')
    .replace(/\b(?:INCH|INCHES|RIMS?|MAGS?|PCD)\b/ig, ' ')
    .replace(/\b[3456]\s*x+\s*\d{3}(?:\.3)?\b/ig, ' ')
    .replace(/\b[3456]\d{3}\b/ig, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  const target = [size, pcd, suffix].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return {
    target,
    changed: target !== original
  };
};

const normalizeTopLevelFolders = async () => {
  const topLevel = await listDirectories(rootDir);
  for (const directory of topLevel) {
    const name = directory.split(/[\\/]/).at(-1) ?? '';
    const normalized = normalizeTopLevelName(name);
    if (!normalized.target) {
      report.skippedTopLevelFolders.push({
        folder: name,
        reason: normalized.reason
      });
      continue;
    }
    if (!normalized.changed) continue;

    const destination = join(rootDir, normalized.target);
    if (destination === directory) continue;
    const result = await renameOrMergeDirectory(directory, destination);
    report.normalizedTopLevelFolders.push({
      from: name,
      to: normalized.target,
      mode: result.mode
    });
  }
};

const deleteEmptyFolders = async () => {
  let deleted = 0;
  while (true) {
    const directories = (await listAllDirectories(rootDir)).sort((first, second) => second.length - first.length);
    const emptyDirectories = [];
    for (const directory of directories) {
      if (!await hasAnyChildren(directory)) emptyDirectories.push(directory);
    }
    if (!emptyDirectories.length) break;

    for (const directory of emptyDirectories) {
      report.deletedEmptyFolders.push(relative(rootDir, directory));
      deleted += 1;
      if (!dryRun) await rm(directory, { recursive: true, force: true });
    }
    if (dryRun) break;
  }
  return deleted;
};

await formatUpdatedFolders();
await flattenNestedUpdatedFolders();
await normalizeTopLevelFolders();
await deleteEmptyFolders();

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  ok: true,
  dryRun,
  rootDir,
  reportPath,
  consolidatedUpdatedFolders: report.consolidatedUpdatedFolders.length,
  renamedUpdatedFolders: report.renamedUpdatedFolders.length,
  flattenedNestedUpdatedFolders: report.flattenedNestedUpdatedFolders.length,
  normalizedTopLevelFolders: report.normalizedTopLevelFolders.length,
  deletedEmptyFolders: report.deletedEmptyFolders.length,
  skippedTopLevelFolders: report.skippedTopLevelFolders.length
}, null, 2));
