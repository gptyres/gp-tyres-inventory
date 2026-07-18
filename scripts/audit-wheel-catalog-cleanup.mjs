import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  buildCleanupReport,
  quarantineFromReport,
  scanWheelCatalog,
  writeCleanupReport
} from './wheel-catalog-cleanup-lib.mjs';

const DEFAULT_ROOT = 'C:/Users/User/Desktop/WHEEL CATALOG 2026 Q3';
const DEFAULT_JSON_REPORT = 'reports/wheel-catalog-cleanup-report.json';
const DEFAULT_CSV_REPORT = 'reports/wheel-catalog-cleanup-report.csv';
const DEFAULT_QUARANTINE_DIR = 'C:/Users/User/Desktop/WHEEL CATALOG 2026 Q3_QUARANTINE';

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith('--') ? args.shift() : 'audit';

const readOption = (name, fallback) => {
  const prefix = `--${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
};

const hasFlag = (name) => args.includes(`--${name}`);

const rootDir = resolve(readOption('root', process.env.WHEEL_CATALOG_ROOT || DEFAULT_ROOT));
const jsonReportPath = resolve(readOption('report', process.env.WHEEL_CATALOG_CLEANUP_REPORT || DEFAULT_JSON_REPORT));
const csvReportPath = resolve(readOption('csv', process.env.WHEEL_CATALOG_CLEANUP_CSV || DEFAULT_CSV_REPORT));
const quarantineDir = resolve(readOption('quarantine', process.env.WHEEL_CATALOG_QUARANTINE_DIR || DEFAULT_QUARANTINE_DIR));

const printUsage = () => {
  console.log([
    'Usage:',
    '  node scripts/audit-wheel-catalog-cleanup.mjs audit --root="C:/path/to/catalog"',
    '  node scripts/audit-wheel-catalog-cleanup.mjs quarantine --report="reports/wheel-catalog-cleanup-report.json" --dry-run',
    '  node scripts/audit-wheel-catalog-cleanup.mjs quarantine --report="reports/wheel-catalog-cleanup-report.json" --quarantine="C:/path/to/quarantine"',
    '',
    'Commands:',
    '  audit       Scan the catalog and write JSON + CSV reports.',
    '  quarantine Move only auto-removable report entries into quarantine.',
    '',
    'Options:',
    '  --root=PATH        Catalog root for audit.',
    '  --report=PATH      JSON report path.',
    '  --csv=PATH         CSV report path for audit.',
    '  --quarantine=PATH  Quarantine destination.',
    '  --dry-run          For quarantine, show planned moves without moving files.'
  ].join('\n'));
};

if (hasFlag('help') || hasFlag('h')) {
  printUsage();
  process.exit(0);
}

if (command === 'audit') {
  console.log(`Scanning wheel catalog: ${rootDir}`);
  const files = await scanWheelCatalog(rootDir);
  const report = buildCleanupReport(files, { rootDir });
  await writeCleanupReport(report, jsonReportPath, csvReportPath);

  console.log(JSON.stringify({
    ok: true,
    rootDir,
    reportPath: jsonReportPath,
    csvPath: csvReportPath,
    summary: report.summary
  }, null, 2));
  process.exit(0);
}

if (command === 'quarantine') {
  const report = JSON.parse(await readFile(jsonReportPath, 'utf8'));
  const result = await quarantineFromReport(report, quarantineDir, { dryRun: hasFlag('dry-run') });
  console.log(JSON.stringify({
    ok: true,
    dryRun: hasFlag('dry-run'),
    reportPath: jsonReportPath,
    quarantineDir,
    planned: result.planned,
    moved: result.moved
  }, null, 2));
  process.exit(0);
}

console.error(`Unknown command: ${command}`);
printUsage();
process.exit(1);
