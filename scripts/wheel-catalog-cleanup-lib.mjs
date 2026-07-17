import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';

export const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
export const CLEANUP_ACTIONS = {
  KEEP: 'keep',
  REMOVE_EXACT_DUPLICATE: 'remove_exact_duplicate',
  REMOVE_OLDER_UPDATED_COPY: 'remove_older_updated_copy',
  REVIEW_MANUALLY: 'review_manually'
};

const UPDATED_FOLDER_PATTERN = /^UPDATED(?:\s+|\s*\()?([^)]*)\)?$/i;

export const normalizeSpaces = (value = '') => value.replace(/\s+/g, ' ').trim();

export const isImageFileName = (fileName) => IMAGE_EXTENSIONS.has(extname(fileName).toLowerCase());

export const walkImageFiles = async (rootDir) => {
  const files = [];

  const walk = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile() && isImageFileName(entry.name)) {
        files.push(absolutePath);
      }
    }
  };

  await walk(rootDir);
  return files.sort((first, second) => first.localeCompare(second));
};

export const parseUpdatedFolderDate = (folderName) => {
  const match = normalizeSpaces(folderName).match(UPDATED_FOLDER_PATTERN);
  if (!match) return null;

  const raw = normalizeSpaces(match[1] ?? '');
  const numeric = raw.match(/\b(\d{1,2})[.\-_/](\d{1,2})\b/);
  if (numeric) {
    const day = Number.parseInt(numeric[1], 10);
    const month = Number.parseInt(numeric[2], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return {
        label: `${day}.${month}`,
        sortValue: 20260000 + month * 100 + day
      };
    }
  }

  const monthNames = new Map([
    ['JAN', 1],
    ['FEB', 2],
    ['MAR', 3],
    ['APR', 4],
    ['MAY', 5],
    ['JUN', 6],
    ['JUL', 7],
    ['AUG', 8],
    ['SEP', 9],
    ['OCT', 10],
    ['NOV', 11],
    ['DEC', 12]
  ]);
  const monthMatch = raw.toUpperCase().match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/);
  if (monthMatch) {
    return {
      label: monthMatch[1],
      sortValue: 20250000 + (monthNames.get(monthMatch[1]) ?? 0) * 100
    };
  }

  return {
    label: raw || 'undated',
    sortValue: 0
  };
};

export const getUpdatedInfo = (pathParts) => {
  const updatedParts = pathParts
    .map((part, index) => ({ part, index, date: parseUpdatedFolderDate(part) }))
    .filter((entry) => entry.date);

  if (!updatedParts.length) {
    return {
      isUpdated: false,
      latestSortValue: -1,
      latestLabel: '',
      depth: 0
    };
  }

  const latest = [...updatedParts].sort((first, second) => (
    second.date.sortValue - first.date.sortValue
    || second.index - first.index
  ))[0];

  return {
    isUpdated: true,
    latestSortValue: latest.date.sortValue,
    latestLabel: latest.date.label,
    depth: updatedParts.length
  };
};

export const normalizeReviewKey = (rootDir, absolutePath) => {
  const rel = relative(rootDir, absolutePath);
  const parts = rel.split(/[\\/]/);
  const fileName = parts.at(-1) ?? '';
  const bucket = parts[0] ?? '';
  const stem = fileName.replace(/\.[^.]+$/, '');
  return [
    normalizeSpaces(bucket).toUpperCase(),
    normalizeSpaces(stem)
      .toUpperCase()
      .replace(/\b\(\d+\)\b/g, '')
      .replace(/\bCOPY\b/g, '')
      .replace(/[^A-Z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  ].join('::');
};

const scoreCandidate = (file) => ([
  file.updatedInfo.latestSortValue,
  file.updatedInfo.isUpdated ? 1 : 0,
  file.modifiedMs,
  -file.relativePath.length
]);

export const compareCandidate = (first, second) => {
  const firstScore = scoreCandidate(first);
  const secondScore = scoreCandidate(second);
  for (let index = 0; index < firstScore.length; index += 1) {
    if (firstScore[index] !== secondScore[index]) return secondScore[index] - firstScore[index];
  }
  return first.relativePath.localeCompare(second.relativePath);
};

export const chooseWinner = (files) => [...files].sort(compareCandidate)[0];

const duplicateReason = (winner, loser) => {
  if (winner.updatedInfo.latestSortValue > loser.updatedInfo.latestSortValue) {
    return {
      action: CLEANUP_ACTIONS.REMOVE_OLDER_UPDATED_COPY,
      reason: `Newer UPDATED folder kept (${winner.updatedInfo.latestLabel || 'latest'}).`
    };
  }

  if (winner.updatedInfo.isUpdated && !loser.updatedInfo.isUpdated) {
    return {
      action: CLEANUP_ACTIONS.REMOVE_OLDER_UPDATED_COPY,
      reason: 'Updated folder copy kept over base-folder duplicate.'
    };
  }

  return {
    action: CLEANUP_ACTIONS.REMOVE_EXACT_DUPLICATE,
    reason: 'Exact duplicate image bytes.'
  };
};

export const scanWheelCatalog = async (rootDir) => {
  const absoluteRoot = resolve(rootDir);
  const imagePaths = await walkImageFiles(absoluteRoot);
  const files = [];

  for (const absolutePath of imagePaths) {
    const bytes = await readFile(absolutePath);
    const sourceStats = await stat(absolutePath);
    const relativePath = relative(absoluteRoot, absolutePath);
    const pathParts = relativePath.split(/[\\/]/).slice(0, -1).map(normalizeSpaces).filter(Boolean);
    files.push({
      absolutePath,
      relativePath,
      fileName: absolutePath.split(/[\\/]/).at(-1) ?? '',
      hash: createHash('sha256').update(bytes).digest('hex'),
      sizeBytes: bytes.byteLength,
      modifiedAt: sourceStats.mtime.toISOString(),
      modifiedMs: sourceStats.mtimeMs,
      pathParts,
      updatedInfo: getUpdatedInfo(pathParts),
      reviewKey: normalizeReviewKey(absoluteRoot, absolutePath)
    });
  }

  return files;
};

export const buildCleanupReport = (files, options = {}) => {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const byHash = new Map();
  const byReviewKey = new Map();
  const entriesByPath = new Map();

  for (const file of files) {
    byHash.set(file.hash, [...(byHash.get(file.hash) ?? []), file]);
    byReviewKey.set(file.reviewKey, [...(byReviewKey.get(file.reviewKey) ?? []), file]);
    entriesByPath.set(file.absolutePath, {
      action: CLEANUP_ACTIONS.KEEP,
      reason: 'Unique image selected for import.',
      sourcePath: file.absolutePath,
      relativePath: file.relativePath,
      chosenWinnerPath: file.absolutePath,
      chosenWinnerRelativePath: file.relativePath,
      duplicateGroupId: '',
      fileName: file.fileName,
      hash: file.hash,
      sizeBytes: file.sizeBytes,
      modifiedAt: file.modifiedAt,
      updatedFolder: file.updatedInfo.latestLabel,
      reviewKey: file.reviewKey
    });
  }

  for (const [hash, hashFiles] of byHash.entries()) {
    if (hashFiles.length <= 1) continue;

    const winner = chooseWinner(hashFiles);
    const duplicateGroupId = `hash:${hash.slice(0, 16)}`;
    for (const file of hashFiles) {
      const entry = entriesByPath.get(file.absolutePath);
      entry.duplicateGroupId = duplicateGroupId;
      entry.chosenWinnerPath = winner.absolutePath;
      entry.chosenWinnerRelativePath = winner.relativePath;
      if (file.absolutePath === winner.absolutePath) {
        entry.reason = `Kept newest copy from ${hashFiles.length} exact duplicates.`;
        continue;
      }

      const decision = duplicateReason(winner, file);
      entry.action = decision.action;
      entry.reason = decision.reason;
    }
  }

  for (const [reviewKey, reviewFiles] of byReviewKey.entries()) {
    const uniqueHashes = new Set(reviewFiles.map((file) => file.hash));
    if (reviewFiles.length <= 1 || uniqueHashes.size <= 1) continue;

    const groupId = `review:${createHash('sha1').update(reviewKey).digest('hex').slice(0, 12)}`;
    for (const file of reviewFiles) {
      const entry = entriesByPath.get(file.absolutePath);
      if (entry.action !== CLEANUP_ACTIONS.KEEP) continue;
      entry.action = CLEANUP_ACTIONS.REVIEW_MANUALLY;
      entry.reason = 'Same catalog bucket and similar file name, but image bytes differ.';
      entry.duplicateGroupId = groupId;
      entry.chosenWinnerPath = '';
      entry.chosenWinnerRelativePath = '';
    }
  }

  const entries = [...entriesByPath.values()]
    .sort((first, second) => first.relativePath.localeCompare(second.relativePath));
  const summary = entries.reduce((counts, entry) => {
    counts[entry.action] = (counts[entry.action] ?? 0) + 1;
    return counts;
  }, {});

  return {
    generatedAt,
    rootDir: options.rootDir ? resolve(options.rootDir) : '',
    summary: {
      totalImages: entries.length,
      keep: summary[CLEANUP_ACTIONS.KEEP] ?? 0,
      removeExactDuplicate: summary[CLEANUP_ACTIONS.REMOVE_EXACT_DUPLICATE] ?? 0,
      removeOlderUpdatedCopy: summary[CLEANUP_ACTIONS.REMOVE_OLDER_UPDATED_COPY] ?? 0,
      reviewManually: summary[CLEANUP_ACTIONS.REVIEW_MANUALLY] ?? 0
    },
    entries
  };
};

const csvCell = (value) => {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
};

export const reportToCsv = (report) => {
  const headers = [
    'action',
    'reason',
    'relativePath',
    'chosenWinnerRelativePath',
    'duplicateGroupId',
    'hash',
    'sizeBytes',
    'modifiedAt'
  ];
  const rows = report.entries.map((entry) => headers.map((header) => csvCell(entry[header])).join(','));
  return `${headers.join(',')}\n${rows.join('\n')}\n`;
};

export const writeCleanupReport = async (report, jsonPath, csvPath) => {
  await mkdir(dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (csvPath) {
    await mkdir(dirname(csvPath), { recursive: true });
    await writeFile(csvPath, reportToCsv(report), 'utf8');
  }
};

export const quarantineFromReport = async (report, quarantineDir, options = {}) => {
  const allowedActions = new Set([
    CLEANUP_ACTIONS.REMOVE_EXACT_DUPLICATE,
    CLEANUP_ACTIONS.REMOVE_OLDER_UPDATED_COPY
  ]);
  const moves = [];
  const absoluteQuarantineDir = resolve(quarantineDir);

  for (const entry of report.entries) {
    if (!allowedActions.has(entry.action)) continue;
    const destination = join(absoluteQuarantineDir, entry.relativePath);
    moves.push({
      sourcePath: entry.sourcePath,
      destinationPath: destination,
      action: entry.action,
      reason: entry.reason
    });
  }

  if (options.dryRun) return { moved: 0, planned: moves.length, moves };

  for (const move of moves) {
    await mkdir(dirname(move.destinationPath), { recursive: true });
    await rename(move.sourcePath, move.destinationPath);
  }

  return { moved: moves.length, planned: moves.length, moves };
};
