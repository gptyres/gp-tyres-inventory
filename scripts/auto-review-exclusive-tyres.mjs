import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildImportCandidates,
  normalizeToken,
  parseSupplierTyreRows
} from './tyre-image-import-workflow.mjs';

const SUPPLIER = 'EXCLUSIVE TYRES';
const OUT_PATH = 'reports/exclusive-tyres-autoreview-sources.json';
const REPORT_PATH = 'reports/exclusive-tyres-autoreview-report.json';
const USER_AGENT = 'Mozilla/5.0 GP Tyres supplier-image autoreview/1.0';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://moiybakshvuvppesbnpt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_CmagmxnGcxu9bGWdwWfwjQ_2y_ZXw9j';

const OFFICIAL_SOURCES = [
  ['RADAR', 'RPX800', 'https://www.radartyres.com/apac/radar/apac-rpx-800', 'https://www.radartyres.com/storage/tire_images/other/RPX_800_(45)_S-19.webp'],
  ['RADAR', 'DIMAX SPRINT', 'https://www.radartyres.com/apac/radar/apac-dimax-sprint', 'https://www.radartyres.com/storage/tire_images/other/Dimax_Sprint_(45).webp'],
  ['RADAR', 'DIMAX SPORT', 'https://www.radartyres.com/apac/radar/apac-dimax-sport', 'https://www.radartyres.com/storage/tire_images/other/Dimax_Sport_(45).webp'],
  ['RADAR', 'DIMAX TOURING', 'https://www.radartyres.com/apac/radar/apac-dimax-touring', 'https://www.radartyres.com/storage/tire_images/other/Dimax_Touring__45-1.webp'],
  ['RADAR', 'DIMAX CLASSIC', 'https://www.radartyres.com/apac/radar/apac-dimax-classic', 'https://www.radartyres.com/storage/tire_images/other/Dimax-Classic-45-BSW_S-19.webp'],
  ['RADAR', 'RENEGADE RT', 'https://www.radartyres.com/apac/radar/apac-renegade-rt-plus', 'https://www.radartyres.com/storage/tire_images/other/Renegade-RT+_(45)_S-19.webp'],
  ['RADAR', 'RENEGADE AT5', 'https://www.radartyres.com/eu/radar/eu-renegade-at5', 'https://www.radartyres.com/storage/tire_images/other/Renegade-AT5_45_S-19.webp'],
  ['RADAR', 'RENEGADE AT SPORT', 'https://www.radartyres.com/eu/radar/eu-renegade-at-sport', 'https://www.radartyres.com/storage/tire_images/other/Renegade_AT_Sport-45.webp'],
  ['RADAR', 'RENEGADE R7', 'https://www.radartyres.com/eu/radar/eu-renegade-r7-mt', 'https://www.radartyres.com/storage/tire_images/other/Renegade_R7_45_S-19.webp'],
  ['RADAR', 'RENEGADE R7 MT', 'https://www.radartyres.com/eu/radar/eu-renegade-r7-mt', 'https://www.radartyres.com/storage/tire_images/other/Renegade_R7_45_S-19.webp'],
  ['RADAR', 'RLT71', 'https://www.radartyres.com/eu/radar/eu-rlt-71', 'https://www.radartyres.com/storage/tire_images/other/RLT_71_(45)_S-19.webp'],
  ['RADAR', 'RENEGADE X', 'https://www.radartyres.com/eu/radar/eu-renegade-x', 'https://www.radartyres.com/storage/tire_images/other/Renegade-X_45.webp'],
  ['RADAR', 'RIVERA PRO 2', 'https://www.radartyres.com/eu/radar/eu-rivera-pro-2', 'https://www.radartyres.com/storage/tire_images/other/Rivera_Pro_2_(45)_S-19.webp'],
  ['LANDSAIL', 'LS588', 'https://landsailtires.com/tires/ls588-uhp', 'https://cms.landsailtires.com/media/pages/tires/ls588-uhp/cbb84bd189-1761962493/lt-ls588-uhp-3q-2025.png'],
  ['FIREMAX', 'FM501 AT', 'https://fdflex.com/en/product/summer-tire-firemax-fm501/', 'https://fdflex.com/wp-content/uploads/2024/01/FM501_1.png'],
  ['WINDFORCE', 'ADVANFORS TOURING', 'https://www.landspidertire.com/product_detail/advanfors-touring.html', 'https://shengchi-test.oss-cn-qingdao.aliyuncs.com/portal/20260202/e4b073f492d063a0aeab2b7f2e8ce089.webp', 'official'],
  ['WINDFORCE', 'ADVANFORS MAX', 'https://www.landspidertire.com/product_detail/advanfors-max.html', 'https://shengchi-test.oss-cn-qingdao.aliyuncs.com/portal/20260119/f6e58d5c1ae99f32dfb5cf0021b35433.webp', 'official'],
  ['WINDFORCE', 'CATCHFORS HP', 'https://www.rubbex.com/en-be/17565-r14-82h-windforce-catchfors-hp-6970004908791', 'https://www.rubbex.com/images/thumbs/075/0757092_Windforce-175-65-R14-82H-Catchfors-H-P-15344842-main.jpg_550.webp', 'retailer'],
  ['TIMAX', 'TM568', 'https://martines.co.za/product/155-80-13-eco32-timax/', 'https://martines.co.za/wp-content/uploads/2023/04/JHJ.jpg', 'retailer'],
  ['TIMAX', 'ECO SUV 71', 'https://www.timaxtyre.com/product/eco-suv-71/', 'https://www.timaxtyre.com/wp-content/uploads/2023/07/1-18.jpg', 'official'],
  ['CEAT', 'ECODRIVE', 'https://whattyre.com/products/ceat-eco-drive/', 'https://whattyre.com/wp-content/uploads/2020/01/120425_FLR.jpg', 'whattyre'],
  ['DUNLOP', 'SP VAN01', 'https://www.dunloptyres.co.za/Tyre-Range/LightTruck/%20SP%20VAN01?site=dunlop', 'https://www.dunloptyres.co.za/content/usercontent/images/FindATyre/single-tyres/medium/Van01.png', 'official'],
  ['FIRESTONE', 'DESTINATION AT GRIP', 'https://tiresvote.com/catalog/firestone/destination-at-grip/', 'https://ws-tires.s3.amazonaws.com/firestone/destination-at-grip/firestone-destination-at-1-600x826.jpg', 'tiresvote'],
  ['GOODYEAR', 'EFFICIENTGRIP PERFORMANCE ZAF', 'https://whattyre.com/products/goodyear-efficientgrip-performance/', 'https://whattyre.com/wp-content/uploads/2020/01/103596_FTR-1.jpg', 'whattyre'],
  ['CONTINENTAL', 'CONTIPREMIUMCONTACT 5', 'https://whattyre.com/products/continental-contipremiumcontact-5/', 'https://whattyre.com/wp-content/uploads/2020/01/101621_FTR.jpg', 'whattyre'],
  ['CONTINENTAL', 'CROSSCONTACT RX', 'https://whattyre.com/products/continental-crosscontact-rx/', 'https://whattyre.com/wp-content/uploads/2020/01/120660_FTR.jpg', 'whattyre'],
  ['DRIVEMASTER', 'ST901', 'https://www.macroyaltyre.com/product_detail/9.html', 'https://omo-oss-image1.thefastimg.com/portal-saas/new2023103115235265202/cms/image/7bfdeaf2-e846-454c-9caf-0a73e8fc92ac.png?vf=B7gH3s', 'official'],
  ['KAPSEN', 'DURABLEMAX RS01', 'https://whattyre.com/products/kapsen-durablemax-rs01/', 'https://whattyre.com/wp-content/uploads/2020/01/116124_FLR.jpg', 'whattyre'],
  ['KAPSEN', 'HS268', 'https://www.kapsentyre.com/manufacturer_KAPSENTYRESHS268_330.html', 'https://www.kapsentyre.com/upload/big/HS268_1_0_1469349377.png', 'official'],
  ['KAPSEN', 'HS101', 'https://www.kapsentyre.com/product_54_HS101.html', 'https://www.terrakingtire.com/wp-content/uploads/sites/3/2019/03/HS101-1-300x300.png', 'official'],
  ['KAPSEN', 'COMFORTMAX S801', 'https://whattyre.com/products/kapsen-comfortmax-s801/', 'https://whattyre.com/wp-content/uploads/2020/01/116119_FLR.jpg', 'whattyre'],
  ['TRACMAX', 'TRANSPORTER RF09', 'https://whattyre.com/products/tracmax-transporter-rf09/', 'https://whattyre.com/wp-content/uploads/2020/01/108217_FLR.jpg', 'whattyre'],
  ['RADAR', 'DIMAX AS 6', 'https://www.omni-united.com/radar-ca/ca-dimax-as-6', 'https://www.omni-united.com/storage/tire_images/other/Dimax_AS6_%2845%29_S-19.webp', 'official'],
  ['RADAR', 'DIMAX AS 8', 'https://www.omni-united.com/radar-ca/ca-dimax-as-8', 'https://www.omni-united.com/storage/tire_images/other/Dimax_AS8_us-2.webp', 'official'],
  ['BRIDGESTONE', 'DUELER HT 684 II', 'https://tires.bridgestone.com/en-us/tires/automotive/dueler/ht-684-ii', 'https://s7d1.scene7.com/is/image/bridgestone/bridgestone-dueler-h-t-684-ii-60-full-web-global-consumer', 'official'],
  ['TIMAX', 'ECO COMFORT 33', 'https://www.timaxtyre.com/product/eco-comfort-33/', 'https://www.timaxtyre.com/wp-content/uploads/2023/07/1-9.jpg', 'official'],
  ['TIMAX', 'TM258', 'https://martines.co.za/product/750r16-lt-ltr28-timax/', 'https://martines.co.za/wp-content/uploads/2023/10/8550-1.png', 'retailer'],
  ['TIMAX', 'ECO COMFORT 34', 'https://www.timaxtyre.com/product/eco-comfort-34/', 'https://www.timaxtyre.com/wp-content/uploads/2023/07/1-10.jpg', 'official'],
  ['TIMAX', 'ECO COMFORT 52', 'https://www.timaxtyre.com/product/eco-comfort-52/', 'https://www.timaxtyre.com/wp-content/uploads/2023/07/1-13.jpg', 'official'],
  ['TIMAX', 'ECO COMFORT 53', 'https://www.timaxtyre.com/product/eco-comfort-53/', 'https://www.timaxtyre.com/wp-content/uploads/2023/07/1-11.jpg', 'official'],
  ['TIMAX', 'ECO COMFORT 55', 'https://www.timaxtyre.com/product/eco-comfort-55/', 'https://www.timaxtyre.com/wp-content/uploads/2023/07/1-15.jpg', 'official'],
  ['TIMAX', 'ECO MAX 61', 'https://www.timaxtyre.com/product/eco-max-61/', 'https://www.timaxtyre.com/wp-content/uploads/2023/07/1-7.jpg', 'official'],
  ['TIMAX', 'ECO SPORT 58', 'https://www.timaxtyre.com/product/eco-sport-58/', 'https://www.timaxtyre.com/wp-content/uploads/2023/07/1-17.jpg', 'official'],
  ['TIMAX', 'ECO SPORT 59', 'https://www.timaxtyre.com/product/eco-sport-59/', 'https://www.timaxtyre.com/wp-content/uploads/2023/07/1-16.jpg', 'official'],
  ['TIMAX', 'ECO31', 'https://www.timaxtyre.com/product/eco31/', 'https://www.timaxtyre.com/wp-content/uploads/2023/07/1-1.jpg', 'official'],
  ['TIMAX', 'LTR16', 'https://www.timaxtyre.com/product/ltr16/', 'https://www.timaxtyre.com/wp-content/uploads/2023/07/1-3.jpg', 'official'],
  ['DRIVEMASTER', 'ST916', 'https://www.macroyaltyre.com/product_detail/14.html', 'https://omo-oss-image1.thefastimg.com/portal-saas/new2023103115235265202/cms/image/927b5617-b7b6-4646-b8a0-6bfb0209e58e.png?vf=B7gH3s', 'official'],
  ['DRIVEMASTER', 'ST939', 'https://www.macroyaltyre.com/product_detail/21.html', 'https://omo-oss-image1.thefastimg.com/portal-saas/new2023103115235265202/cms/image/5bdc0e97-c1c2-4552-84f7-33f0a955d2fc.png?vf=B7gH3s', 'official'],
  ['DRIVEMASTER', 'ST969', 'https://www.glamorcorp.com/drivemaster-tyre/63643837.html', 'https://bsg-i.nbxc.com/product/26/f6/e9/4cde2e4e8ea0501bce8402525a.jpg', 'official'],
  ['TRACMAX', 'GRT800', 'https://thetyremall.co.za/product/tracmax-295-80r22-5-grt800-152-148m/', 'https://thetyremall.co.za/wp-content/uploads/grt800.jpg', 'retailer'],
  ['TRACMAX', 'GRT901', 'https://martines.co.za/product/12r22-5-grt901-tracmax/', 'https://martines.co.za/wp-content/uploads/2023/10/t2.jpg', 'retailer'],
  ['CEAT', 'MILAZE', 'https://www.ceat.com/scooter-tyres/scooter-product-listing/product-details/90-100-10-milaze-tl-53j-sw.html', 'https://www.ceat.com/content/dam/ceat/product-images/scooter/milaze/sku_0.png', 'official'],
  ['CEAT', 'SECURA ZOOM+', 'https://www.ceat.com/bike-tyres/bike-product-listing/product-details/90-90-18-secura-zoom-plus-tl-51p.html', 'https://www.ceat.com/content/dam/ceat/product-images/motorcycle/secura-zoom-/sku_0.png', 'official'],
  ['CEAT', 'SECURA F85', 'https://www.ceat.com/bike-tyres/bike-product-listing/product-details/2-75-18-secura-f85-tl-42p.html', 'https://www.ceat.com/content/dam/ceat/product-images/motorcycle/secura-f85/sku_0.png', 'official'],
  ['CONTINENTAL', 'WORLDCONTACT 4X4', 'https://www.errolstyres.co.za/tyre/continental/worldcontact-4x4/6687/', 'https://www.errolstyres.co.za/images/cmsimages/big/product_6687_733_continentalworldcontact4x4.jpg', 'errols']
  ,
  ['ANCHEE', 'AC808', 'https://whattyre.com/products/anchee-ac808/', 'https://whattyre.com/wp-content/uploads/2020/01/125954_FLR.jpg', 'whattyre'],
  ['KAPSEN', 'HS166', 'https://www.terrakingtire.com/product/terraking-tyre-hs166/', 'https://www.terrakingtire.com/wp-content/uploads/sites/3/2019/03/HS166-1.png', 'official'],
  ['TRACMAX', 'TRANSPORTER RF08', 'https://www.rubbex.com/en-be/1550-r12-88n-tracmax-rf08-6956647603620', 'https://www.rubbex.com/images/thumbs/082/0820348_Tracmax-155-R12C-88N-86N-RF08-15420159-main.jpg_550.webp', 'retailer'],
  ['FIREMAX', 'FM188', 'https://www.protyre.co.zw/shop/p/firemax-fm188', 'https://images.squarespace-cdn.com/content/v1/652cf7abaf95b56a1033b8e1/c58a101a-3095-4841-b4af-9ec7e699e8ff/firemax-fm188.png', 'retailer']
].map(([brand, pattern, sourcePageUrl, imageUrl, source = 'official']) => ({
  brand,
  pattern,
  key: `${normalizeToken(brand)}::${normalizeToken(pattern)}`,
  sourcePageUrl,
  imageUrl,
  source
}));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readRawExport = async (filePath) => {
  const source = await readFile(filePath, 'utf8');
  const equalsIndex = source.indexOf('=');
  const semicolonIndex = source.lastIndexOf(';');
  const literal = source.slice(equalsIndex + 1, semicolonIndex > equalsIndex ? semicolonIndex : undefined).trim();
  if (literal.startsWith('`')) return literal.slice(1, literal.lastIndexOf('`'));
  if (literal.startsWith('"') || literal.startsWith("'")) return JSON.parse(literal);
  throw new Error(`Could not read raw supplier export from ${filePath}`);
};

const slugify = (value = '') => normalizeToken(value)
  .toLowerCase()
  .replace(/\+/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const stripHtml = (value = '') => value
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&#039;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ')
  .trim();

const productImageFromWhatTyre = (html) => {
  const urls = [...html.matchAll(/https?:\/\/[^"'<>\\\s]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'<>\\\s]*)?/gi)]
    .map((match) => match[0])
    .filter((url) => /whattyre\.com\/wp-content\/uploads/i.test(url))
    .filter((url) => !/contents|tyre-diameter|logo|brand|banner|300x1080|991x100/i.test(url));
  return [...new Set(urls)][0] || '';
};

const importantTokens = (value = '') => normalizeToken(value)
  .replace(/\b(?:TYRE|TYRES|RADIAL|THE|AND)\b/g, ' ')
  .split(/\s+/)
  .filter(Boolean);

const titleMatchesCandidate = (title, candidate) => {
  const titleKey = normalizeToken(title);
  const compactTitleKey = titleKey.replace(/\s+/g, '');
  if (!titleKey.includes(candidate.brandKey)) return false;
  const tokens = importantTokens(candidate.patternKey);
  return tokens.length > 0 && tokens.every((token) => titleKey.includes(token) || compactTitleKey.includes(token.replace(/\s+/g, '')));
};

const fetchText = async (url) => {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  const text = await response.text();
  return { ok: response.ok, status: response.status, text };
};

const fetchExistingCoverage = async () => {
  const url = `${SUPABASE_URL}/rest/v1/supplier_stock_images?select=supplier,design_key,finish_key,active&supplier=eq.${encodeURIComponent(SUPPLIER)}&active=eq.true`;
  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  });
  if (!response.ok) return new Set();
  const rows = await response.json();
  return new Set(rows.map((row) => `${normalizeToken(row.finish_key)}::${normalizeToken(row.design_key)}`));
};

const resolveOfficial = (candidate) => {
  const source = OFFICIAL_SOURCES.find((entry) => entry.key === `${candidate.brandKey}::${candidate.patternKey}`);
  if (!source) return null;
  return {
    brand: candidate.brand,
    pattern: candidate.pattern,
    confidence: 'exact',
    imageUrl: source.imageUrl,
    sourcePageUrl: source.sourcePageUrl,
    checkedSourceUrls: [source.sourcePageUrl],
    source: source.source,
    reason: `${source.source === 'official' ? 'Official manufacturer' : 'Verified product reference'} page and product-image path match brand and pattern.`
  };
};

const resolveWhatTyre = async (candidate) => {
  const patternSlug = slugify(candidate.pattern);
  const slugVariants = [
    patternSlug,
    patternSlug.replace(/\b([a-z]+)(\d+)\b/g, '$1-$2'),
    patternSlug.replace(/\b([a-z]+)(\d+)-([a-z]+)\b/g, '$1-$2-$3'),
    patternSlug.replace(/-zaf$/, ''),
    patternSlug.replace(/-za$/, '')
  ];
  const checkedSourceUrls = [];
  let lastReason = '';

  for (const variant of [...new Set(slugVariants)]) {
    const url = `https://whattyre.com/products/${slugify(candidate.brand)}-${variant}/`;
    checkedSourceUrls.push(url);
    const { ok, text } = await fetchText(url);
    if (!ok || /page not found|oops/i.test(text)) continue;
    const h1 = stripHtml(text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '');
    if (!titleMatchesCandidate(h1, candidate)) {
      lastReason = `WhatTyre title did not exactly match: ${h1}`;
      continue;
    }
    const imageUrl = productImageFromWhatTyre(text);
    if (!imageUrl) {
      lastReason = 'WhatTyre page matched, but no product image was found.';
      continue;
    }
    return {
      brand: candidate.brand,
      pattern: candidate.pattern,
      confidence: 'exact',
      imageUrl,
      sourcePageUrl: url,
      checkedSourceUrls,
      source: 'whattyre',
      reason: `WhatTyre page title matched exactly: ${h1}`
    };
  }

  return { checkedSourceUrls, reason: lastReason };
};

let errolsProductsPromise;
const loadErrolsProducts = async () => {
  if (errolsProductsPromise) return errolsProductsPromise;
  errolsProductsPromise = (async () => {
    const { text } = await fetchText('https://www.errolstyres.co.za/tyres');
    return [...text.matchAll(/<div class="product">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g)]
      .map((match) => match[1])
      .map((block) => {
        const href = block.match(/<a href="([^"]+)" class="product_image"/)?.[1] || '';
        const image = block.match(/data-src="([^"]+)"/)?.[1] || '';
        const brand = stripHtml(block.match(/<span class="TitleCase">([^<]+)<\/span>/)?.[1] || '');
        const pattern = stripHtml(block.match(/<br \/>([^<]+)<\/a>/)?.[1] || '');
        if (!href || !image || !brand || !pattern) return null;
        const sourcePageUrl = new URL(href.replace(/^\.\.\//, ''), 'https://www.errolstyres.co.za/').href;
        const imageUrl = new URL(image.replace(/^\.\.\//, '').replace('/listing/', '/big/'), 'https://www.errolstyres.co.za/').href;
        return { brand, pattern, title: `${brand} ${pattern}`, sourcePageUrl, imageUrl };
      })
      .filter(Boolean);
  })();
  return errolsProductsPromise;
};

const resolveErrols = async (candidate) => {
  const checkedSourceUrls = ['https://www.errolstyres.co.za/tyres'];
  const products = await loadErrolsProducts();
  const product = products.find((entry) => titleMatchesCandidate(entry.title, candidate));
  if (!product) return { checkedSourceUrls };
  return {
    brand: candidate.brand,
    pattern: candidate.pattern,
    confidence: 'exact',
    imageUrl: product.imageUrl,
    sourcePageUrl: product.sourcePageUrl,
    checkedSourceUrls: [product.sourcePageUrl, ...checkedSourceUrls],
    source: 'errols',
    reason: `Errols product title matched exactly: ${product.title}`
  };
};

const main = async () => {
  const batchSize = Number.parseInt(process.env.EXCLUSIVE_AUTOREVIEW_LIMIT || process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || '120', 10);
  const raw = await readRawExport('supplier_data/exclusiveTyresData.ts');
  const rows = parseSupplierTyreRows(SUPPLIER, 'exclusive', raw);
  const existingCoverage = await fetchExistingCoverage();
  const candidates = buildImportCandidates(rows)
    .filter((candidate) => candidate.affectedSuppliers.includes(SUPPLIER))
    .filter((candidate) => !existingCoverage.has(`${candidate.brandKey}::${candidate.patternKey}`))
    .slice(0, batchSize);

  const sources = [];
  const review = [];
  for (const candidate of candidates) {
    const official = resolveOfficial(candidate);
    if (official) {
      sources.push(official);
      review.push({ id: candidate.id, status: 'exact', source: official.source, sourcePageUrl: official.sourcePageUrl, imageUrl: official.imageUrl });
      continue;
    }

    await sleep(120);
    const whatTyre = await resolveWhatTyre(candidate);
    if (whatTyre.confidence === 'exact') {
      sources.push(whatTyre);
      review.push({ id: candidate.id, status: 'exact', source: whatTyre.source, sourcePageUrl: whatTyre.sourcePageUrl, imageUrl: whatTyre.imageUrl });
      continue;
    }

    await sleep(120);
    const errols = await resolveErrols(candidate);
    if (errols.confidence === 'exact') {
      sources.push(errols);
      review.push({ id: candidate.id, status: 'exact', source: errols.source, sourcePageUrl: errols.sourcePageUrl, imageUrl: errols.imageUrl });
      continue;
    }

    review.push({
      id: candidate.id,
      brand: candidate.brand,
      pattern: candidate.pattern,
      status: 'missing',
      checkedSourceUrls: [...(whatTyre.checkedSourceUrls ?? []), ...(errols.checkedSourceUrls ?? [])],
      reason: whatTyre.reason || errols.reason || 'No exact official, WhatTyre, or Errols source found.'
    });
  }

  await mkdir(join(OUT_PATH, '..'), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(sources, null, 2));
  await writeFile(REPORT_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    supplier: SUPPLIER,
    inspectedCandidates: candidates.length,
    exactCount: sources.length,
    missingCount: review.filter((entry) => entry.status === 'missing').length,
    sourcesByType: sources.reduce((acc, source) => {
      acc[source.source] = (acc[source.source] || 0) + 1;
      return acc;
    }, {}),
    review
  }, null, 2));
  console.log(JSON.stringify({
    output: OUT_PATH,
    report: REPORT_PATH,
    inspectedCandidates: candidates.length,
    exactCount: sources.length,
    sourcesByType: sources.reduce((acc, source) => {
      acc[source.source] = (acc[source.source] || 0) + 1;
      return acc;
    }, {})
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
