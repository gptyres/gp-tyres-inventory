import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [wheelSource, tyreLifeSource, treadsSource] = process.argv.slice(2);

if (!wheelSource || !tyreLifeSource || !treadsSource) {
  throw new Error('Usage: node scripts/refresh-tyre-life-treads-data.mjs <tyre-life-wheels.csv> <tyre-life-tyres.csv> <treads-unlimited.csv>');
}

const normalizeCsv = async (filePath) => (
  (await readFile(resolve(filePath), 'utf8'))
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trimEnd()
);

const wheelCsv = await normalizeCsv(wheelSource);
const tyreLifeCsv = await normalizeCsv(tyreLifeSource);
const treadsCsv = await normalizeCsv(treadsSource);
const asTemplateLiteral = (value) => value
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\$\{/g, '\\${');

await writeFile(
  resolve('supplier_data/tyreLifeWheelsData.ts'),
  `export const TYRE_LIFE_WHEELS_RAW_DATA = ${JSON.stringify(wheelCsv)};\n`,
  'utf8'
);

await writeFile(
  resolve('supplier_data/tyreLifeData.ts'),
  `export const TYRE_LIFE_RAW_DATA = \`${asTemplateLiteral(tyreLifeCsv)}\`;\n`,
  'utf8'
);

await writeFile(
  resolve('supplier_data/treadsUnlimitedData.ts'),
  `export const TREADS_UNLIMITED_RAW_DATA = \`${asTemplateLiteral(treadsCsv)}\`;\n`,
  'utf8'
);

console.log('Refreshed Tyre Life Wheels, Tyre Life Tyres, and Treads Unlimited supplier data.');
