import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';

const SUPPLIER = 'WHEEL TECH';
const SOURCE = 'facebook-marketplace';
const ROOT_DIR = 'marketplace-listing-assets/wheel-tech';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://moiybakshvuvppesbnpt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_CmagmxnGcxu9bGWdwWfwjQ_2y_ZXw9j';
const IMPORT_FUNCTION_SLUG = process.env.SUPPLIER_IMAGE_IMPORT_FUNCTION || 'import-supplier-stock-image';
const IMPORT_CONCURRENCY = Math.max(1, Number.parseInt(process.env.SUPPLIER_IMAGE_IMPORT_CONCURRENCY || '4', 10));
const SHOULD_IMPORT = process.argv.includes('--import');

const loadLocalEnv = async () => {
  const text = await readFile('.env.local', 'utf8').catch(() => '');
  text.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]]) return;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  });
};

await loadLocalEnv();
const IMPORT_TOKEN = process.env.SUPPLIER_IMAGE_IMPORT_TOKEN;

const parseCsvLine = (line) => {
  const values = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  values.push(current.trim());
  return values;
};

const mimeFor = (fileName) => {
  const extension = extname(fileName).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.gif') return 'image/gif';
  return 'image/jpeg';
};

const parseWheelSpecs = (title) => {
  const normalized = String(title || '').replace(/×/g, 'x').replace(/\s+/g, ' ').trim();
  const rimSize = normalized.match(/\b(1[3-9]|2[0-6])\s*(?:x\s*\d+(?:\.\d+)?\s*J?|inch|inches|in|\")\b/i)?.[1] ?? null;
  const pcd = normalized.match(/\b([456])\s*x\s*(\d{3}(?:\.\d+)?)\b/i);
  const offset = normalized.match(/\bET\s*([+-]?\d+(?:\.\d+)?)\b/i)?.[1] ?? null;
  return {
    rimSize,
    pcd: pcd ? `${pcd[1]}/${pcd[2]}` : null,
    offset
  };
};

const catalogueText = await readFile(join(ROOT_DIR, 'catalogue.csv'), 'utf8');
const catalogueByListing = new Map(
  catalogueText
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map(parseCsvLine)
    .filter((columns) => columns[0] && columns[1] && columns[2])
    .map((columns) => [`${columns[0]}::${columns[1]}`, {
      title: columns[2],
      price: columns[3],
      cardImagePath: columns[4]
    }])
);

const profiles = await readdir(ROOT_DIR, { withFileTypes: true });
const candidates = [];
for (const profileEntry of profiles.filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))) {
  const listingsPath = join(ROOT_DIR, profileEntry.name, 'listings');
  const listings = await readdir(listingsPath, { withFileTypes: true }).catch(() => []);
  for (const listingEntry of listings.filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))) {
    const listing = catalogueByListing.get(`${profileEntry.name}::${listingEntry.name}`);
    if (!listing) continue;
    const imagesPath = join(listingsPath, listingEntry.name, 'images');
    const imageEntries = (await readdir(imagesPath, { withFileTypes: true }).catch(() => []))
      .filter((entry) => entry.isFile() && /\.(?:jpe?g|png|webp|gif)$/i.test(entry.name))
      .sort((first, second) => first.name.localeCompare(second.name));
    imageEntries.forEach((imageEntry, index) => {
      candidates.push({
        profileId: profileEntry.name,
        listingId: listingEntry.name,
        title: listing.title,
        price: listing.price,
        fileName: imageEntry.name,
        filePath: join(imagesPath, imageEntry.name),
        imageIndex: index + 1
      });
    });
    if (!imageEntries.length && listing.cardImagePath) {
      const cardImagePath = join(ROOT_DIR, listing.cardImagePath);
      const cardImageExists = await stat(cardImagePath).then((entry) => entry.isFile()).catch(() => false);
      if (cardImageExists) {
        candidates.push({
          profileId: profileEntry.name,
          listingId: listingEntry.name,
          title: listing.title,
          price: listing.price,
          fileName: listing.cardImagePath.split('/').at(-1),
          filePath: cardImagePath,
          imageIndex: 1
        });
      }
    }
  }
}

const importOne = async (candidate) => {
  const bytes = await readFile(candidate.filePath);
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  const sourceKey = `facebook-${candidate.profileId}-${candidate.listingId}`;
  const specs = parseWheelSpecs(candidate.title);
  const extension = extname(candidate.fileName).toLowerCase() || '.jpg';
  const payload = {
    supplier: SUPPLIER,
    source: SOURCE,
    sourceFileId: `${sourceKey}::${String(candidate.imageIndex).padStart(2, '0')}::${candidate.fileName}`,
    fileName: candidate.fileName,
    storagePath: `wheels/wheel-tech/facebook/${candidate.profileId}/${candidate.listingId}/${contentHash}${extension}`,
    mimeType: mimeFor(candidate.fileName),
    designKey: `LISTING ${candidate.listingId}`,
    finishKey: 'WHEEL TECH',
    rimSize: specs.rimSize,
    pcd: specs.pcd,
    tags: [
      'wheel-tech',
      'facebook-marketplace',
      sourceKey,
      `listing:${candidate.listingId}`,
      `price-zar:${candidate.price}`,
      specs.offset ? `offset:${specs.offset}` : '',
      candidate.title
    ].filter(Boolean),
    base64: bytes.toString('base64')
  };
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${IMPORT_FUNCTION_SLUG}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'x-supplier-image-import-token': IMPORT_TOKEN
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) throw new Error(body.error || `HTTP ${response.status}`);
  return payload.storagePath;
};

if (SHOULD_IMPORT && !IMPORT_TOKEN) throw new Error('SUPPLIER_IMAGE_IMPORT_TOKEN is required for --import.');

let imported = 0;
let failed = 0;
const failures = [];
if (SHOULD_IMPORT) {
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < candidates.length) {
      const candidate = candidates[nextIndex];
      nextIndex += 1;
      try {
        await importOne(candidate);
        imported += 1;
      } catch (error) {
        failed += 1;
        failures.push({ listingId: candidate.listingId, fileName: candidate.fileName, error: String(error?.message || error) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(IMPORT_CONCURRENCY, candidates.length) }, worker));
}

console.log(JSON.stringify({
  ok: failed === 0,
  importRequested: SHOULD_IMPORT,
  listings: new Set(candidates.map((candidate) => candidate.listingId)).size,
  imagesFound: candidates.length,
  imported,
  failed,
  failures
}, null, 2));

process.exit(failed === 0 ? 0 : 1);
