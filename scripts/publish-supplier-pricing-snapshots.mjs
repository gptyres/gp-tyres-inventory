import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://moiybakshvuvppesbnpt.supabase.co';
const serviceKey = process.env.SUPABASE_SECRET_KEY;
const dryRun = process.argv.includes('--dry-run');
const exportItemsJson = process.argv.includes('--export-items-json');
if (!dryRun && !exportItemsJson && !serviceKey) throw new Error('SUPABASE_SECRET_KEY is not available in this environment.');

const sources = [
  {
    catalog: 'ALINE',
    supplier: 'Aline',
    dataFile: 'supplier_data/alineData.ts',
    sourceFile: 'aline_raw_inventory_2026-07-16.csv',
    parser: 'aline'
  },
  {
    catalog: 'APEX',
    supplier: 'Apex',
    dataFile: 'supplier_data/apexData.ts',
    sourceFile: 'apex_portal_import_2026-07-15.csv'
  },
  {
    catalog: 'TREADS_UNLIMITED',
    supplier: 'Threads Unlimited',
    dataFile: 'supplier_data/treadsUnlimitedData.ts',
    sourceFile: 'threads_unlimited_portal_import_2026-07-15.csv'
  },
  {
    catalog: 'TUBESTONE',
    supplier: 'Tubestone',
    dataFile: 'supplier_data/tubestoneData.ts',
    sourceFile: 'tubestone_portal_import_2026-07-16.csv'
  },
  {
    catalog: 'EXOTIC',
    supplier: 'Exotic',
    dataFile: 'supplier_data/exoticData.ts',
    sourceFile: 'exotic_portal_import_2026-07-15.csv'
  }
];

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted && char === '"' && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ',') {
      row.push(cell);
      cell = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
};

const readEmbeddedCsv = async (file) => {
  const moduleText = await readFile(resolve(file), 'utf8');
  const assignment = moduleText.indexOf('=');
  const terminator = moduleText.lastIndexOf(';');
  if (assignment < 0 || terminator < assignment) throw new Error(`Could not read embedded CSV from ${file}.`);
  return JSON.parse(moduleText.slice(assignment + 1, terminator).trim());
};

const clean = (value) => String(value ?? '').trim();
const catalogArgumentIndex = process.argv.indexOf('--catalog');
const requestedCatalog = catalogArgumentIndex >= 0 ? clean(process.argv[catalogArgumentIndex + 1]).toUpperCase() : '';
const selectedSources = requestedCatalog
  ? sources.filter((source) => source.catalog === requestedCatalog)
  : sources.filter((source) => source.catalog !== 'EXOTIC');
if (!selectedSources.length) throw new Error(`Unsupported supplier catalog: ${requestedCatalog || '(blank)'}.`);
const parseMoney = (value) => Number.parseFloat(clean(value).replace(/[^0-9.-]/g, '')) || 0;
const parseStock = (value) => Number.parseInt(clean(value).replace(/[^0-9-]/g, ''), 10) || 0;
const stableIdentityHash = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
};

const normalizeToken = (value) => clean(value)
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/[^A-Za-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();

const alineFinishHints = [
  ['ARCTICSILVERMF', 'ARCTIC SILVER'], ['ARCTICSILVER', 'ARCTIC SILVER'],
  ['ARCTICSIL', 'ARCTIC SILVER'], ['ARCTIC SILVER', 'ARCTIC SILVER'],
  ['AMBER BRNZ', 'AMBER BRONZE'], ['BKML', 'BLACK MACHINED LIP'],
  ['BLKML', 'BLACK MACHINED LIP'], ['BRNZ BLK LIP', 'BRONZE BLACK LIP'],
  ['BRONZE BLK LIP', 'BRONZE BLACK LIP'], ['CRYSTAL SILVER', 'CRYSTAL SILVER'],
  ['DARK TINT SMOKE', 'DARK TINT SMOKE'], ['DIAMOND BLK', 'DIAMOND BLACK'],
  ['GLOSS BLACK', 'GLOSS BLACK'], ['GLOSS BLK', 'GLOSS BLACK'],
  ['GLOSSBLK', 'GLOSS BLACK'], ['GMML', 'GMMF'], ['GMMF', 'GMMF'],
  ['GM MF', 'GMMF'], ['GRAPHITE', 'GRAPHITE'], ['GRANITE', 'GRANITE'],
  ['HYPER BLACK', 'HYPER BLACK'], ['HYPERBLK', 'HYPER BLACK'],
  ['HYPER SILVER', 'HYPER SILVER'], ['MATT CHG', 'MATT CHG'],
  ['MATT TITANIUM', 'MATT TITANIUM'], ['MACHINE FACE', 'MACHINE FACE'],
  ['MACHINED', 'MACHINED'], ['POLISHED LIP', 'POLISHED LIP'],
  ['SATIN BLACK TINT', 'SATIN BLACK TINT'], ['SATIN BLK TINT', 'SATIN BLACK TINT'],
  ['SATINBLK TINT', 'SATIN BLACK TINT'], ['SATIN BLACK', 'SATIN BLACK'],
  ['SATIN BLK', 'SATIN BLACK'], ['SATINBLK', 'SATIN BLACK'],
  ['SEPANG SILVER', 'SEPANG SILVER'], ['SILK BLACK', 'SILK BLACK'],
  ['SILK BLK', 'SILK BLACK'], ['SILKBLK', 'SILK BLACK'],
  ['SLKBLK', 'SILK BLACK'], ['SLBLK', 'SILK BLACK'],
  ['SSML', 'SILVER MACHINED LIP'], ['SSMF', 'SSMF'],
  ['STBKTNT', 'SATIN BLACK TINT'], ['STBLKTNT', 'SATIN BLACK TINT'],
  ['STBKML', 'SATIN BLACK MACHINED LIP'], ['STBKMILLED', 'SATIN BLACK MILLED'],
  ['STBLK', 'SATIN BLACK'], ['STBK', 'SATIN BLACK'],
  ['TINTED SMOKE', 'TINTED SMOKE'], ['TITANIUM BLK LIP', 'TITANIUM BLACK LIP'],
  ['VELVET BLACK', 'VELVET BLACK'], ['VELVET BLK', 'VELVET BLACK'],
  ['VELVETBLK', 'VELVET BLACK'], ['VELBLK', 'VELVET BLACK'],
  ['GOLD', 'GOLD'], ['CIDER', 'CIDER'], ['CHG TINT', 'CHG TINT'],
  ['CHGTINT', 'CHG TINT'], ['CHGTNT', 'CHG TINT'], ['CHG', 'CHG']
];

const alineSpecialDesigns = new Set([
  'AR Z2', 'BIG ROCK', 'LE MANS', 'MEGA X', 'STEEL BLACK SPOKE',
  'STEEL CHROME MODULAR', 'STEEL MODULAR BLACK', 'STEEL SOFT 8',
  'STEEL SPOKE GREY', 'STEEL SPOKE', 'STEEL WHITE SPOKE'
]);

const parseAlineDescription = (description) => {
  const compact = description.replace(/\s+/g, '');
  const spec = compact.match(/^([3-6])(\d{3})(\d{2})X(\d{1,2}(?:\.\d+)?)/i);
  const offset = description.match(/\bET\s*(-?\d+)/i)?.[1] || '';
  const centerBore = description.match(/\b(\d{2,3}\.\d)\b/)?.[1] || '';
  let withoutSpec = description
    .replace(/^[456]\d{3}(?:1[3-9]|2[0-6])X\d+(?:\.\d+)?(?:\/[0-9.]+)?/i, '')
    .replace(/\bET\s*-?\d+\b/gi, ' ')
    .trim();
  const normalized = normalizeToken(withoutSpec);
  const finish = alineFinishHints
    .filter(([hint]) => normalized.includes(normalizeToken(hint)))
    .sort((a, b) => b[0].length - a[0].length)[0]?.[1] || '';
  const beforeSpecs = normalizeToken(withoutSpec.split(/\b(?:ET\s*-?\d+|\d{2,3}(?:\.\d)?|R\b|F\b)\b/i)[0]);
  const words = beforeSpecs.split(' ').filter(Boolean);
  let design = words[0] || normalizeToken(description);
  if (design === 'BIGROCK') design = 'BIG ROCK';
  else if (design === 'AR' || /^AR\d*/.test(design)) design = 'AR Z2';
  else if (/^MONACO\d*/.test(design)) design = 'MONACO';
  else if (/^DESTROYER\d*/.test(design)) design = 'DESTROYER';
  else if (/^VILLAIN/.test(design)) design = 'VILLAIN';
  else if (/^HOSTILE/.test(design)) design = 'HOSTILE';
  else {
    for (let length = Math.min(3, words.length); length >= 2; length -= 1) {
      const candidate = words.slice(0, length).join(' ');
      if (alineSpecialDesigns.has(candidate)) {
        design = candidate;
        break;
      }
    }
  }

  return {
    size: spec ? `${spec[3]}X${spec[4]}` : 'N/A',
    pcd: spec ? `${spec[1]}/${Number(spec[2])}` : '',
    offset,
    centerBore,
    design,
    finish
  };
};

const buildAlineItems = (rows, source) => {
  const headers = rows[0].map(clean);
  const column = (name) => {
    const index = headers.indexOf(name);
    if (index < 0) throw new Error(`${source.catalog}: missing ${name}.`);
    return index;
  };
  const get = (row, name) => clean(row[column(name)]);

  return rows.slice(1).map((row) => {
    const sku = get(row, 'Stock Code');
    const description = get(row, 'Description');
    const brand = get(row, 'Brand') || 'A-Line';
    const wheel = parseAlineDescription(description);
    const isWheel = wheel.size !== 'N/A';
    const displayName = isWheel ? (wheel.design || description) : description;
    const finish = isWheel ? wheel.finish : '';
    const stockByLocation = {
      JHB: parseStock(get(row, 'Qty JHB')),
      CPT: parseStock(get(row, 'Qty CPT')),
      DBN: parseStock(get(row, 'Qty DBN'))
    };
    const stockUnits = Object.values(stockByLocation).reduce((total, quantity) => total + quantity, 0);
    const stockLocation = Object.entries(stockByLocation).map(([location, quantity]) => `${location}: ${quantity}`).join(' | ');
    const costPrice = parseMoney(get(row, 'Price inc VAT'));
    const recommendedPrice = parseMoney(get(row, 'Recommended Retail From')) || costPrice;
    const rawIdentity = [source.catalog, sku, description].join('-').toLowerCase();
    const sourceKey = `${rawIdentity.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 168)}-${stableIdentityHash(rawIdentity)}`;

    return {
      catalog_key: source.catalog,
      source_key: sourceKey,
      product_type: 'WHEEL',
      supplier: source.supplier,
      supplier_sku: sku,
      brand,
      product_name: `${brand} ${displayName}${finish ? ` ${finish}` : ''}`,
      tyre_pattern: displayName,
      tyre_specs: finish || null,
      wheel_pcd: wheel.pcd || null,
      wheel_offset: wheel.offset || null,
      wheel_center_bore: wheel.centerBore || null,
      stock_by_location: stockByLocation,
      category: get(row, 'Category') || 'Wheels',
      size: wheel.size,
      stock_location: stockLocation,
      stock_units_availability: stockUnits > 0 ? 'In stock' : 'Out of stock',
      stock_units: stockUnits,
      cost_price: costPrice,
      selling_price: recommendedPrice,
      source_stock_detail: stockLocation,
      source_file: basename(source.sourceFile)
    };
  }).filter((item) => item.supplier_sku);
};

const buildItems = async (source) => {
  const rows = parseCsv(await readEmbeddedCsv(source.dataFile));
  if (source.parser === 'aline') return buildAlineItems(rows, source);
  const headers = rows[0].map(clean);
  const column = (name) => {
    const index = headers.indexOf(name);
    if (index < 0) throw new Error(`${source.catalog}: missing ${name}.`);
    return index;
  };
  const locationColumns = headers.flatMap((header, index) => {
    const match = header.match(/^(.+?)\s+Stock Units$/i);
    return match && !/^total$/i.test(match[1]) ? [{ index, location: match[1].trim() }] : [];
  });
  const get = (row, name) => clean(row[column(name)]);

  return rows.slice(1).map((row) => {
    const sku = get(row, 'Supplier SKU');
    const stockByLocation = Object.fromEntries(locationColumns.map(({ index, location }) => [location, parseStock(row[index])]));
    const stockUnits = Object.values(stockByLocation).reduce((total, quantity) => total + quantity, 0);
    const stockLocation = Object.entries(stockByLocation).map(([location, quantity]) => `${location}: ${quantity}`).join(' | ');
    const rawIdentity = [source.catalog, sku, get(row, 'TYRE_SIZE'), get(row, 'Product Name'), get(row, 'Cost Price')].join('-').toLowerCase();
    const sourceKey = `${rawIdentity.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 168)}-${stableIdentityHash(rawIdentity)}`;
    return {
      catalog_key: source.catalog,
      source_key: sourceKey,
      product_type: 'TYRE',
      supplier: source.supplier,
      supplier_sku: sku,
      brand: get(row, 'TYRE_BRAND'),
      product_name: get(row, 'Product Name'),
      tyre_pattern: get(row, 'TYRE_PATTERN') || null,
      tyre_rating: get(row, 'TYRE_RATING') || null,
      tyre_index: get(row, 'TYRE_INDEX') || null,
      tyre_specs: get(row, 'TYRE_SPECS') || null,
      stock_by_location: stockByLocation,
      category: get(row, 'Category') || 'Tyres',
      size: get(row, 'TYRE_SIZE'),
      stock_location: stockLocation,
      stock_units_availability: stockUnits > 0 ? 'In stock' : 'Out of stock',
      stock_units: stockUnits,
      cost_price: parseMoney(get(row, 'Cost Price')),
      selling_price: parseMoney(get(row, 'Selling Price')),
      source_stock_detail: stockLocation,
      source_file: basename(source.sourceFile)
    };
  });
};

const prepared = await Promise.all(selectedSources.map(async (source) => ({ ...source, items: await buildItems(source) })));
const totalRows = prepared.reduce((total, source) => total + source.items.length, 0);
if (exportItemsJson) {
  const argumentValue = (name, fallback) => {
    const index = process.argv.indexOf(name);
    const parsed = index >= 0 ? Number.parseInt(process.argv[index + 1], 10) : fallback;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  const offset = argumentValue('--offset', 0);
  const limit = argumentValue('--limit', totalRows);
  console.log(JSON.stringify(prepared.flatMap((source) => source.items).slice(offset, offset + limit)));
  process.exit(0);
}
if (dryRun) {
  console.log(JSON.stringify({
    dryRun: true,
    totalRows,
    suppliers: prepared.map((source) => ({
      supplier: source.supplier,
      catalog: source.catalog,
      products: source.items.length,
      stockUnits: source.items.reduce((total, item) => total + item.stock_units, 0),
      sample: source.items.find((item) => item.supplier_sku === '82410224') || source.items[0]
    }))
  }, null, 2));
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
let jobId = '';
const snapshotIds = [];

try {
  const now = new Date().toISOString();
  const isSingleSupplier = prepared.length === 1;
  const singleSupplier = prepared[0];
  const { data: job, error: jobError } = await supabase.from('supplier_sync_jobs').insert({
    scope: isSingleSupplier ? 'SINGLE_SUPPLIER' : 'ALL_ENABLED',
    target_supplier: isSingleSupplier ? singleSupplier.supplier : null,
    target_catalog: isSingleSupplier ? singleSupplier.catalog : null,
    status: 'running',
    requested_by_staff: 'Codex supplier pricing refresh',
    requested_by_terminal: 'CODEX',
    artifact_name: isSingleSupplier ? singleSupplier.sourceFile : 'supplier_refresh_summary_2026-07-15.csv',
    suppliers_total: prepared.length,
    progress_stage: 'publishing',
    progress_current: 0,
    progress_total: totalRows,
    progress_message: `Publishing ${totalRows.toLocaleString('en-ZA')} validated supplier products`,
    started_at: now,
    heartbeat_at: now
  }).select('id').single();
  if (jobError) throw jobError;
  jobId = job.id;

  let published = 0;
  const activationEntries = [];
  for (const source of prepared) {
    const { data: snapshot, error: snapshotError } = await supabase.from('supplier_catalog_snapshots').insert({
      job_id: jobId,
      catalog_key: source.catalog,
      registry_supplier: source.supplier,
      status: 'staging',
      row_count: source.items.length,
      source_files: [source.sourceFile]
    }).select('id').single();
    if (snapshotError) throw snapshotError;
    snapshotIds.push(snapshot.id);

    for (let offset = 0; offset < source.items.length; offset += 500) {
      const batch = source.items.slice(offset, offset + 500).map((item) => ({ ...item, snapshot_id: snapshot.id }));
      const { error: itemError } = await supabase.from('supplier_catalog_items').insert(batch);
      if (itemError) throw itemError;
      published += batch.length;
      const { error: progressError } = await supabase.from('supplier_sync_jobs').update({
        progress_current: published,
        progress_message: `Published ${published.toLocaleString('en-ZA')} / ${totalRows.toLocaleString('en-ZA')} supplier products`,
        heartbeat_at: new Date().toISOString()
      }).eq('id', jobId);
      if (progressError) throw progressError;
    }
    activationEntries.push({ snapshot_id: snapshot.id, catalog_key: source.catalog, registry_supplier: source.supplier });
  }

  const { error: activateError } = await supabase.rpc('activate_supplier_catalog_snapshots', {
    p_job_id: jobId,
    p_snapshots: activationEntries
  });
  if (activateError) throw activateError;

  const completedAt = new Date().toISOString();
  const resultSummary = {
    source: isSingleSupplier ? singleSupplier.sourceFile : 'supplier_refresh_summary_2026-07-15.csv',
    suppliers: prepared.map((source) => ({ supplier: source.supplier, catalog: source.catalog, rowsPublished: source.items.length, status: 'ok' }))
  };
  const { error: completionError } = await supabase.from('supplier_sync_jobs').update({
    status: 'succeeded',
    progress_stage: 'completed',
    progress_current: totalRows,
    progress_total: totalRows,
    progress_message: `Published ${totalRows.toLocaleString('en-ZA')} supplier products`,
    suppliers_completed: prepared.length,
    rows_published: totalRows,
    result_summary: resultSummary,
    heartbeat_at: completedAt,
    completed_at: completedAt
  }).eq('id', jobId);
  if (completionError) throw completionError;

  console.log(JSON.stringify({ jobId, completedAt, totalRows, suppliers: resultSummary.suppliers }, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (snapshotIds.length) await supabase.from('supplier_catalog_snapshots').update({ status: 'failed', safe_error: message.slice(0, 300) }).in('id', snapshotIds);
  if (jobId) {
    const completedAt = new Date().toISOString();
    await supabase.from('supplier_sync_jobs').update({
      status: 'failed',
      progress_stage: 'failed',
      progress_message: message.slice(0, 300),
      safe_error: message.slice(0, 300),
      suppliers_failed: prepared.length,
      heartbeat_at: completedAt,
      completed_at: completedAt
    }).eq('id', jobId);
  }
  throw error;
}
