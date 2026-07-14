import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const sourcePath = process.argv[2];
const outputPath = process.argv[3] || 'supplier_data/bridgestoneData.ts';

if (!sourcePath) {
  throw new Error('Usage: node scripts/import-bridgestone-data.mjs <source.csv> [output.ts]');
}

const rawCsv = (await readFile(resolve(sourcePath), 'utf8'))
  .replace(/^\uFEFF/, '')
  .replace(/\r\n/g, '\n')
  .trimEnd();
const escapedCsv = rawCsv
  .replace(/`/g, '\\`')
  .replace(/\$\{/g, '\\${');

await writeFile(
  resolve(outputPath),
  `export const BRIDGESTONE_RAW_DATA = \`${escapedCsv}\`;\n`,
  'utf8'
);

console.log(`Embedded ${rawCsv.split('\n').length - 1} Bridgestone supplier rows in ${outputPath}.`);
