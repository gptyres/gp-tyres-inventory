import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [wheelSource, tyreSource] = process.argv.slice(2);

if (!wheelSource || !tyreSource) {
  throw new Error('Usage: node scripts/refresh-tyre-life-treads-data.mjs <tyre-life-wheels.csv> <treads-unlimited.csv>');
}

const normalizeCsv = async (filePath) => (
  (await readFile(resolve(filePath), 'utf8'))
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trimEnd()
);

const wheelCsv = await normalizeCsv(wheelSource);
const tyreCsv = await normalizeCsv(tyreSource);
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
  resolve('supplier_data/treadsUnlimitedData.ts'),
  `export const TREADS_UNLIMITED_RAW_DATA = \`${asTemplateLiteral(tyreCsv)}\`;\n`,
  'utf8'
);

console.log('Refreshed Tyre Life Wheels and Treads Unlimited supplier data.');
