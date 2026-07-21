import { InventoryItem, ProductType, TyreProduct, WheelProduct } from './types';
import { supabase } from './supabaseClient';
import {
  normalizeSupplierImageToken,
  parseSupplierTyreImageKeys
} from './supplierTyreImageKeys.mjs';

export { normalizeSupplierImageToken, parseSupplierTyreImageKeys } from './supplierTyreImageKeys.mjs';

export interface SupplierStockImageRow {
  id: string;
  supplier: string;
  source?: string;
  source_file_id?: string;
  design_key: string;
  finish_key?: string | null;
  rim_size?: string | null;
  pcd?: string | null;
  tags: string[];
  file_name: string;
  storage_bucket: string;
  storage_path: string;
  public_image_url: string;
  mime_type: string;
  active: boolean;
  imported_at: string;
  updated_at?: string;
}

export interface SupplierImageMatchCandidate {
  supplierName?: string | null;
  source?: string | null;
  sourceFileId?: string | null;
  designKey: string;
  finishKey?: string | null;
  rimSize?: string | null;
  pcd?: string | null;
  publicImageUrl: string;
  fileName: string;
  importedAt?: string | null;
  updatedAt?: string | null;
}

export interface SupplierImageLookupItem {
  id: string;
  productType: ProductType;
  supplierName?: string;
  supplierStockCode?: string;
  imageDesignKey?: string;
  imageFinishKey?: string;
  size?: string;
  pcd?: string;
}

export interface StaffSupplierTyreImageUploadPayload {
  supplier: string;
  source: 'staff-upload';
  sourceFileId: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  designKey: string;
  finishKey: string;
  tags: string[];
  base64: string;
  uploadedBy?: string;
}

export interface SupplierImageMatchResult {
  imageUrl?: string;
  confidence: 'exact' | 'best' | 'ambiguous' | 'missing';
  candidates: SupplierImageMatchCandidate[];
}

const supplierImageCache = new Map<string, Promise<SupplierStockImageRow[]>>();
const SUPPLIER_STOCK_IMAGE_PAGE_SIZE = 1000;

const SPECIAL_DESIGN_NAMES = new Set([
  'AR Z2',
  'BIG ROCK',
  'LE MANS',
  'MEGA X',
  'STEEL BLACK SPOKE',
  'STEEL CHROME MODULAR',
  'STEEL MODULAR BLACK',
  'STEEL SOFT 8',
  'STEEL SPOKE GREY',
  'STEEL SPOKE',
  'STEEL WHITE SPOKE'
]);

const canonicalSupplierDesignKey = (value: string | undefined | null): string => {
  let designKey = normalizeSupplierImageToken(value)
    .replace(/\bDYMANIC\b/g, 'DYNAMIC')
    .replace(/\bDYNAMIC STEEL WHEELS\b/g, 'DYNAMIC STEEL');

  if (designKey === 'ZENNITH') designKey = 'ZENITH';
  if (designKey === 'SUNRAYSIA') designKey = 'DYNAMIC SUNRAYSIA';
  if (designKey === 'ROADKILL') designKey = 'A9301 ROADKILL';

  designKey = designKey
    .replace(/^DYNAMIC STEEL\s+(BEADLOCK IMITATION|BLACK ROUND HOLE|DYNAMIC SUNRAYSIA|GENUINE BEADLOCK|SOFT 8)$/, '$1')
    .replace(/^DYNAMIC STEEL\s+SOFT\s+8$/, 'SOFT 8');

  return designKey.trim();
};

const FINISH_HINTS = [
  ['ARCTICSILVERMF', 'ARCTIC SILVER'],
  ['ARCTICSILVER', 'ARCTIC SILVER'],
  ['ARCTICSIL', 'ARCTIC SILVER'],
  ['ARCTIC SILVE', 'ARCTIC SILVER'],
  ['ARCTIC SIVER', 'ARCTIC SILVER'],
  ['ARCTIC SIL', 'ARCTIC SILVER'],
  ['ARCTIC SILVER', 'ARCTIC SILVER'],
  ['AMBER BRNZ', 'AMBER BRONZE'],
  ['BKMF', 'GMMF'],
  ['BKML', 'BLACK MACHINED LIP'],
  ['BLKML', 'BLACK MACHINED LIP'],
  ['BLACK SPOKE', 'BLACK SPOKE'],
  ['BRNZ BLK LIP', 'BRONZE BLACK LIP'],
  ['BRONZE BLK LIP', 'BRONZE BLACK LIP'],
  ['CIDER', 'CIDER'],
  ['CHG TINT', 'CHG TINT'],
  ['CHGTINT', 'CHG TINT'],
  ['CHGTNT', 'CHG TINT'],
  ['CHG TN', 'CHG TINT'],
  ['CHG', 'CHG'],
  ['CRYSTAL SILVER', 'CRYSTAL SILVER'],
  ['CRYSTALSILVER', 'CRYSTAL SILVER'],
  ['DARK TINT SMOKE', 'DARK TINT SMOKE'],
  ['DIAMOND BLK', 'DIAMOND BLACK'],
  ['GLOSS BLK', 'GLOSS BLACK'],
  ['GLOSSBLK', 'GLOSS BLACK'],
  ['GLOSS BLACK', 'GLOSS BLACK'],
  ['GOLD', 'GOLD'],
  ['GMML', 'GMMF'],
  ['GMMF', 'GMMF'],
  ['GM MF', 'GMMF'],
  ['GRAPHITE', 'GRAPHITE'],
  ['GRANITE', 'GRANITE'],
  ['HYPER BLACK', 'HYPER BLACK'],
  ['HYPERBLK', 'HYPER BLACK'],
  ['HYPER SILVER', 'HYPER SILVER'],
  ['MATT CHG', 'MATT CHG'],
  ['MATT TITANIUM', 'MATT TITANIUM'],
  ['MACHINE FACE', 'MACHINE FACE'],
  ['MACHINED', 'MACHINED'],
  ['POLISHED LIP', 'POLISHED LIP'],
  ['SATIN BLK TINT', 'SATIN BLACK TINT'],
  ['SATINBLK TINT', 'SATIN BLACK TINT'],
  ['SATIN BLK', 'SATIN BLACK'],
  ['SATINBLK', 'SATIN BLACK'],
  ['SEPANG SILVER', 'SEPANG SILVER'],
  ['SILK BLK', 'SILK BLACK'],
  ['SILKBLK', 'SILK BLACK'],
  ['SLKBLK', 'SILK BLACK'],
  ['SLBLK', 'SILK BLACK'],
  ['SSML', 'SILVER MACHINED LIP'],
  ['SSMF', 'SSMF'],
  ['STBKTNT', 'SATIN BLACK TINT'],
  ['STBKML', 'SATIN BLACK MACHINED LIP'],
  ['STBKMILLED', 'SATIN BLACK MILLED'],
  ['STBK', 'SATIN BLACK'],
  ['STBLKTNT', 'SATIN BLACK TINT'],
  ['STBLK', 'SATIN BLACK'],
  ['TINTED SMOKE', 'TINTED SMOKE'],
  ['TITANIUM BLK LIP', 'TITANIUM BLACK LIP'],
  ['VELVET BLK', 'VELVET BLACK'],
  ['VELVETBLK', 'VELVET BLACK'],
  ['VELBLK', 'VELVET BLACK']
] as const;

const normalizeDescription = (value: string): string => (
  value
    .replace(/×/g, 'X')
    .replace(/\bFLOW\s*FORM(?:ING)?\b/gi, ' ')
    .replace(/\bFLOWFORM\b/gi, ' ')
    .replace(/\bFLOWF\b/gi, ' ')
    .replace(/\bTRACK\s*USE\b/gi, ' ')
    .replace(/\bLOAD\b/gi, ' ')
    .replace(/\bCB\b/gi, ' ')
);

const stripLeadingWheelSpec = (description: string): string => {
  let value = normalizeDescription(description).trim();
  const patterns = [
    /^[456]\d{3}(?:1[3-9]|2[0-6])X\d+(?:\.\d+)?(?:\/[0-9.]+)?/i,
    /^[456]\d{3}\d{2}X\d+(?:\.\d+)?(?:\/[0-9.]+)?/i,
    /^\d{2}X\d+(?:\.\d+)?(?:\/[0-9.]+)?/i,
    /^[A-Z]*\d+X\d+(?:\.\d+)?(?:\/[0-9.]+)?/i
  ];

  for (const pattern of patterns) {
    const next = value.replace(pattern, '').trim();
    if (next !== value) {
      value = next;
      break;
    }
  }

  return value.replace(/\bET\s*-?\d+\b/gi, ' ').trim();
};

export const extractAlineFinishKey = (value: string): string => {
  const source = normalizeSupplierImageToken(value);
  const matched = FINISH_HINTS
    .filter(([hint]) => source.includes(normalizeSupplierImageToken(hint)))
    .sort((first, second) => second[0].length - first[0].length)[0];

  return matched ? normalizeSupplierImageToken(matched[1]) : '';
};

const extractSpecialDesignName = (source: string): string => {
  const words = normalizeSupplierImageToken(source).split(' ').filter(Boolean);
  const compactFirst = words[0] ?? '';

  if (compactFirst === 'BIGROCK') return 'BIG ROCK';
  if (compactFirst === 'AR' || /^AR\d*/.test(compactFirst)) return 'AR Z2';
  if (/^MONACO\d*/.test(compactFirst)) return 'MONACO';
  if (/^DESTROYER\d*/.test(compactFirst)) return 'DESTROYER';
  if (/^VILLAIN/.test(compactFirst)) return 'VILLAIN';
  if (/^HOSTILE/.test(compactFirst)) return 'HOSTILE';
  if (compactFirst === 'AW') return 'STEEL CHROME MODULAR';
  if (compactFirst === 'WHITE' && words[1] === 'SPOKE') return 'STEEL WHITE SPOKE';
  if (compactFirst === 'STBK' || compactFirst === 'STBLK') {
    if (words.some((word) => word.includes('SOFT8')) || (words.includes('SOFT') && words.includes('8'))) return 'STEEL SOFT 8';
    if (words.includes('MOD')) return 'STEEL MODULAR BLACK';
    if (words[1] === 'SPOKE') return 'STEEL SPOKE';
  }

  for (let length = Math.min(3, words.length); length >= 2; length -= 1) {
    const candidate = words.slice(0, length).join(' ');
    if (SPECIAL_DESIGN_NAMES.has(candidate)) return candidate;
  }
  return words[0] ?? '';
};

export const parseAlineStockImageKeys = (description: string) => {
  const cleaned = stripLeadingWheelSpec(description);
  const beforeSpecs = cleaned
    .split(/\b(?:ET\s*-?\d+|\d{2,3}(?:\.\d)?|R\b|F\b)\b/i)[0]
    .trim();
  const designKey = extractSpecialDesignName(beforeSpecs || cleaned);

  return {
    designKey,
    finishKey: extractAlineFinishKey(description)
  };
};

const normalizeAlinePcdDiameter = (value: string): string => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '';
  if (parsed === 114) return '114.3';
  if (parsed === 139) return '139.7';
  return String(parsed);
};

export const parseAlineWheelDescription = (description: string) => {
  const source = String(description || '').replace(/Ã—/g, 'X').trim();
  const specification = source.match(
    /^\s*([3-6])\s*(\d{3})\s*(\d{2})\s*X\s*(\d{1,2}(?:\.\d+)?)\s*(?:\/\s*(\d{2,3}(?:\.\d)?))?/i
  );
  const imageKeys = parseAlineStockImageKeys(source);
  const primaryPcd = specification
    ? `${specification[1]}/${normalizeAlinePcdDiameter(specification[2])}`
    : '';
  const secondaryPcd = specification?.[5]
    ? `${specification[1]}/${normalizeAlinePcdDiameter(specification[5])}`
    : '';
  const explicitOffset = source.match(/\bET\s*(-?\d{1,3})(?:[FR])?\b/i)?.[1] || '';
  const remainingDescription = specification ? source.slice(specification[0].length) : source;
  const inferredOffset = explicitOffset
    ? ''
    : remainingDescription.match(/\b(-?\d{2})(?!\.\d)(?:\s*[FR])?(?:\s*\(RS\))?\b/i)?.[1] || '';
  const centerBore = remainingDescription.match(/\b(?:CB\s*)?(\d{2,3}\.\d)\b/i)?.[1] || '';

  return {
    size: specification ? `${specification[3]}x${specification[4]}` : '',
    pcd: [primaryPcd, secondaryPcd].filter(Boolean).join(' & '),
    offset: explicitOffset || inferredOffset,
    centerBore,
    designKey: specification ? imageKeys.designKey : '',
    finishKey: specification ? imageKeys.finishKey : ''
  };
};

export const slugifySupplierImageToken = (value: string | undefined | null): string => (
  normalizeSupplierImageToken(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'unknown'
);

const extensionFromMimeType = (mimeType: string, fileName: string): string => {
  const extension = fileName.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (extension && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension)) return extension;
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'jpg';
};

export const buildStaffSupplierTyreImageUploadPayload = ({
  item,
  brand,
  pattern,
  fileName,
  mimeType,
  base64,
  hash,
  uploadedBy
}: {
  item: InventoryItem;
  brand: string;
  pattern: string;
  fileName: string;
  mimeType: string;
  base64: string;
  hash: string;
  uploadedBy?: string;
}): StaffSupplierTyreImageUploadPayload => {
  if (item.type !== ProductType.TYRE) throw new Error('Only supplier tyre images can be uploaded here.');

  const tyre = item as TyreProduct;
  const supplier = tyre.supplierName?.trim();
  if (!supplier) throw new Error('This tyre is not linked to a supplier catalogue.');

  const imageKeys = parseSupplierTyreImageKeys(brand, pattern);
  if (!imageKeys.designKey || !imageKeys.finishKey) {
    throw new Error('Confirm both tyre brand and tread/pattern before uploading.');
  }

  const supplierSlug = slugifySupplierImageToken(supplier);
  const brandSlug = slugifySupplierImageToken(imageKeys.finishKey);
  const patternSlug = slugifySupplierImageToken(imageKeys.designKey);
  const extension = extensionFromMimeType(mimeType, fileName);

  return {
    supplier,
    source: 'staff-upload',
    sourceFileId: `staff-upload:${supplierSlug}:${brandSlug}:${patternSlug}`,
    fileName,
    storagePath: `tyres/staff-upload/${supplierSlug}/${brandSlug}/${patternSlug}/${hash}.${extension}`,
    mimeType,
    designKey: imageKeys.designKey,
    finishKey: imageKeys.finishKey,
    tags: Array.from(new Set([
      'staff-upload',
      supplier,
      imageKeys.finishKey,
      imageKeys.designKey,
      uploadedBy ? `uploaded-by:${uploadedBy}` : ''
    ].filter(Boolean))),
    base64,
    uploadedBy
  };
};

export const supplierTyreMatchesUploadKeys = (
  item: InventoryItem,
  _supplier: string,
  brand: string,
  pattern: string
): boolean => {
  if (item.type !== ProductType.TYRE) return false;
  const tyre = item as TyreProduct;

  const targetKeys = parseSupplierTyreImageKeys(brand, pattern);
  const rawTyreKeys = parseSupplierTyreImageKeys(tyre.brand, tyre.pattern);
  const storedTyreKeys = parseSupplierTyreImageKeys(tyre.imageFinishKey || tyre.brand, tyre.imageDesignKey || '');
  const itemKeys = inventoryItemToSupplierImageLookup(item);
  const designCandidates = new Set([
    rawTyreKeys.designKey,
    storedTyreKeys.designKey,
    normalizeSupplierImageToken(itemKeys?.imageDesignKey)
  ].filter(Boolean));
  const finishCandidates = new Set([
    rawTyreKeys.finishKey,
    storedTyreKeys.finishKey,
    normalizeSupplierImageToken(itemKeys?.imageFinishKey)
  ].filter(Boolean));

  return designCandidates.has(targetKeys.designKey) && finishCandidates.has(targetKeys.finishKey);
};

export const parseSupplierWheelImageKeys = (brand: string, wheelName: string, finish: string, stockCode = '') => {
  const brandKey = normalizeSupplierImageToken(brand);
  const normalizedBrandKey = canonicalSupplierDesignKey(brandKey);
  let designName = normalizeSupplierImageToken(wheelName)
    .replace(/\bDYMANIC\b/g, 'DYNAMIC')
    .replace(/\bDYNAMIC STEEL WHEELS\b/g, 'DYNAMIC STEEL');

  if (normalizedBrandKey) {
    const brandPattern = new RegExp(`^${normalizedBrandKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`);
    designName = designName.replace(brandPattern, '');
  }

  const stockCodePrefix = normalizeSupplierImageToken(stockCode).match(/\bA?(\d{4}S?)\b/)?.[1];
  if (stockCodePrefix === '9301' && designName === 'ROADKILL') designName = 'A9301 ROADKILL';

  return {
    designKey: canonicalSupplierDesignKey(designName || brandKey || 'WHEEL'),
    finishKey: normalizeSupplierImageToken(finish || brand)
  };
};

export const parseAlineImageFileName = (fileName: string) => {
  const stem = fileName.replace(/\.[^.]+$/, '');
  const rimSize = stem.match(/(?:^|[^0-9])(1[3-9]|2[0-6])\s*(?:''|["”]|INCH|INCHES|IN)/i)?.[1]
    ?? stem.match(/\b(1[3-9]|2[0-6])\s*(?:INCH|INCHES|IN|")?\b/i)?.[1]
    ?? null;
  const designKey = extractSpecialDesignName(stem);
  const pcd = stem.match(/\b([456])\s*X\s*(\d{3}(?:\.\d)?)\b/i);

  return {
    designKey,
    finishKey: extractAlineFinishKey(stem),
    rimSize,
    pcd: pcd ? `${pcd[1]}/${pcd[2]}` : null,
    tags: Array.from(new Set(normalizeSupplierImageToken(stem).split(' ').filter((tag) => tag.length > 1)))
  };
};

const rimSizeFromItemSize = (size: string | undefined): string => {
  const match = (size ?? '').match(/\b(1[3-9]|2[0-6])\s*x/i);
  return match?.[1] ?? '';
};

const normalizePcd = (value: string | undefined | null): string => (
  normalizeSupplierImageToken(value).replace(/\s*X\s*/g, '/')
);

const isStaffUploadedSupplierImage = (candidate: SupplierImageMatchCandidate): boolean => (
  normalizeSupplierImageToken(candidate.source) === 'STAFF UPLOAD'
  || (candidate.sourceFileId ?? '').toLowerCase().startsWith('staff-upload:')
);

const supplierImageTimestamp = (candidate: SupplierImageMatchCandidate): number => {
  const timestamp = Date.parse(candidate.updatedAt ?? candidate.importedAt ?? '');
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const findBestSupplierStockImage = (
  item: SupplierImageLookupItem,
  candidates: SupplierImageMatchCandidate[]
): SupplierImageMatchResult => {
  const designKey = canonicalSupplierDesignKey(item.imageDesignKey);
  if (!designKey) return { confidence: 'missing', candidates: [] };

  const supplierKey = normalizeSupplierImageToken(item.supplierName);
  const designMatches = candidates.filter((candidate) => (
    canonicalSupplierDesignKey(candidate.designKey) === designKey
    && (!supplierKey || normalizeSupplierImageToken(candidate.supplierName) === supplierKey)
  ));
  if (!designMatches.length) return { confidence: 'missing', candidates: [] };

  const itemFinish = normalizeSupplierImageToken(item.imageFinishKey);
  const finishMatches = itemFinish
    ? designMatches.filter((candidate) => normalizeSupplierImageToken(candidate.finishKey) === itemFinish)
    : designMatches;

  const itemRim = rimSizeFromItemSize(item.size);
  const itemPcd = normalizePcd(item.pcd);

  const scored = (finishMatches.length ? finishMatches : designMatches)
    .map((candidate) => {
      let score = 100;
      const candidateFinish = normalizeSupplierImageToken(candidate.finishKey);
      if (itemFinish && candidateFinish === itemFinish) score += 30;
      else if (itemFinish && !candidateFinish) score -= 5;
      else if (itemFinish) score -= 20;
      if (itemRim && candidate.rimSize === itemRim) score += 10;
      if (itemPcd && normalizePcd(candidate.pcd) === itemPcd) score += 8;
      if (isStaffUploadedSupplierImage(candidate)) score += 60;
      return { candidate, score };
    })
    .sort((first, second) => {
      if (second.score !== first.score) return second.score - first.score;
      const secondTimestamp = supplierImageTimestamp(second.candidate);
      const firstTimestamp = supplierImageTimestamp(first.candidate);
      if (secondTimestamp !== firstTimestamp) return secondTimestamp - firstTimestamp;
      return first.candidate.fileName.localeCompare(second.candidate.fileName, undefined, { numeric: true });
    });

  const topScore = scored[0].score;
  const topCandidates = scored.filter((entry) => entry.score === topScore).map((entry) => entry.candidate);
  const confidence = topCandidates.length > 1
    ? 'ambiguous'
    : topScore >= 130
      ? 'exact'
      : 'best';

  return {
    imageUrl: scored[0].candidate.publicImageUrl,
    confidence,
    candidates: topCandidates
  };
};

export const inventoryItemToSupplierImageLookup = (item: InventoryItem): SupplierImageLookupItem | null => {
  if (item.type === ProductType.WHEEL) {
    const wheel = item as WheelProduct;
    const supplierName = wheel.supplierName ?? (item.id.toUpperCase().includes('ALINE') ? 'ALINE' : undefined);
    if (!supplierName || !wheel.imageDesignKey) return null;

    return {
      id: item.id,
      productType: ProductType.WHEEL,
      supplierName,
      supplierStockCode: wheel.supplierStockCode,
      imageDesignKey: wheel.imageDesignKey,
      imageFinishKey: wheel.imageFinishKey,
      size: wheel.size,
      pcd: wheel.pcd
    };
  }

  if (item.type === ProductType.TYRE) {
    const tyre = item as TyreProduct;
    if (!tyre.supplierName) return null;

    const imageKeys = parseSupplierTyreImageKeys(
      tyre.brand || tyre.imageFinishKey || '',
      tyre.pattern || tyre.imageDesignKey || ''
    );
    return {
      id: item.id,
      productType: ProductType.TYRE,
      supplierName: tyre.supplierName,
      supplierStockCode: tyre.supplierStockCode,
      imageDesignKey: imageKeys.designKey,
      imageFinishKey: imageKeys.finishKey || normalizeSupplierImageToken(tyre.imageFinishKey),
      size: tyre.size
    };
  }

  return null;
};

export const fetchSupplierStockImages = async (supplier?: string): Promise<SupplierStockImageRow[]> => {
  const cacheKey = supplier ? normalizeSupplierImageToken(supplier) : 'ALL_SUPPLIERS';

  if (!supplierImageCache.has(cacheKey)) {
    supplierImageCache.set(cacheKey, (async () => {
      const rows: SupplierStockImageRow[] = [];
      let from = 0;

      while (true) {
        let query = (supabase as any)
          .from('supplier_stock_images')
          .select('id,supplier,source,source_file_id,design_key,finish_key,rim_size,pcd,tags,file_name,storage_bucket,storage_path,public_image_url,mime_type,active,imported_at,updated_at')
          .eq('active', true);

        if (supplier) {
          query = query.eq('supplier', supplier);
        }

        const { data, error } = await query
          .order('design_key', { ascending: true })
          .order('file_name', { ascending: true })
          .range(from, from + SUPPLIER_STOCK_IMAGE_PAGE_SIZE - 1);

        if (error) throw error;

        const page = data ?? [];
        rows.push(...page);

        if (page.length < SUPPLIER_STOCK_IMAGE_PAGE_SIZE) break;
        from += SUPPLIER_STOCK_IMAGE_PAGE_SIZE;
      }

      return rows;
    })());
  }

  return supplierImageCache.get(cacheKey)!;
};

export const clearSupplierStockImageCache = (supplier?: string) => {
  if (supplier) {
    supplierImageCache.delete(normalizeSupplierImageToken(supplier));
  }
  supplierImageCache.delete('ALL_SUPPLIERS');
};

const supplierDesignGroupKey = (supplierName: string | undefined | null, designKey: string | undefined | null): string => (
  `${normalizeSupplierImageToken(supplierName)}::${normalizeSupplierImageToken(designKey)}`
    .replace(/::(.+)$/, (_match, design) => `::${canonicalSupplierDesignKey(design)}`)
);

const globalTyreDesignGroupKey = (designKey: string | undefined | null): string => (
  `GLOBAL_TYRE::${canonicalSupplierDesignKey(designKey)}`
);

export const buildSupplierImageMap = (
  items: InventoryItem[],
  imageRows: SupplierStockImageRow[]
): Record<string, string> => {
  const candidatesBySupplierAndDesign = imageRows.reduce<Record<string, SupplierImageMatchCandidate[]>>((groups, row) => {
    const groupKey = supplierDesignGroupKey(row.supplier, row.design_key);
    groups[groupKey] = groups[groupKey] ?? [];
    const candidate = {
      supplierName: row.supplier,
      source: row.source,
      sourceFileId: row.source_file_id,
      designKey: row.design_key,
      finishKey: row.finish_key,
      rimSize: row.rim_size,
      pcd: row.pcd,
      publicImageUrl: row.public_image_url,
      fileName: row.file_name,
      importedAt: row.imported_at,
      updatedAt: row.updated_at
    };
    groups[groupKey].push(candidate);
    if (row.storage_path.toLowerCase().startsWith('tyres/')) {
      const globalGroupKey = globalTyreDesignGroupKey(row.design_key);
      groups[globalGroupKey] = groups[globalGroupKey] ?? [];
      groups[globalGroupKey].push(candidate);
    }
    return groups;
  }, {});

  return items.reduce<Record<string, string>>((imageMap, item) => {
    const lookupItem = inventoryItemToSupplierImageLookup(item);
    if (!lookupItem) return imageMap;

    const isTyre = lookupItem.productType === ProductType.TYRE;
    const candidates = isTyre
      ? candidatesBySupplierAndDesign[globalTyreDesignGroupKey(lookupItem.imageDesignKey)] ?? []
      : candidatesBySupplierAndDesign[supplierDesignGroupKey(lookupItem.supplierName, lookupItem.imageDesignKey)] ?? [];
    const match = findBestSupplierStockImage(
      isTyre ? { ...lookupItem, supplierName: undefined } : lookupItem,
      candidates
    );
    if (match.imageUrl) imageMap[item.id] = match.imageUrl;
    return imageMap;
  }, {});
};
