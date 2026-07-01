import { InventoryItem, ProductType, WheelProduct } from './types';
import { supabase } from './supabaseClient';

export interface SupplierStockImageRow {
  id: string;
  supplier: string;
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
  designKey: string;
  finishKey?: string | null;
  rimSize?: string | null;
  pcd?: string | null;
  publicImageUrl: string;
  fileName: string;
}

export interface SupplierImageLookupItem {
  id: string;
  imageDesignKey?: string;
  imageFinishKey?: string;
  size?: string;
  pcd?: string;
}

export interface SupplierImageMatchResult {
  imageUrl?: string;
  confidence: 'exact' | 'best' | 'ambiguous' | 'missing';
  candidates: SupplierImageMatchCandidate[];
}

const supplierImageCache = new Map<string, Promise<SupplierStockImageRow[]>>();

export const normalizeSupplierImageToken = (value: string | undefined | null): string => (
  (value ?? '')
    .normalize('NFKD')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

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

const FINISH_HINTS = [
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

export const findBestSupplierStockImage = (
  item: SupplierImageLookupItem,
  candidates: SupplierImageMatchCandidate[]
): SupplierImageMatchResult => {
  const designKey = normalizeSupplierImageToken(item.imageDesignKey);
  if (!designKey) return { confidence: 'missing', candidates: [] };

  const designMatches = candidates.filter((candidate) => normalizeSupplierImageToken(candidate.designKey) === designKey);
  if (!designMatches.length) return { confidence: 'missing', candidates: [] };

  const itemFinish = normalizeSupplierImageToken(item.imageFinishKey);
  const itemRim = rimSizeFromItemSize(item.size);
  const itemPcd = normalizePcd(item.pcd);

  const scored = designMatches
    .map((candidate) => {
      let score = 100;
      if (itemFinish && normalizeSupplierImageToken(candidate.finishKey) === itemFinish) score += 30;
      if (itemRim && candidate.rimSize === itemRim) score += 10;
      if (itemPcd && normalizePcd(candidate.pcd) === itemPcd) score += 8;
      if (!candidate.finishKey && itemFinish) score -= 5;
      return { candidate, score };
    })
    .sort((first, second) => {
      if (second.score !== first.score) return second.score - first.score;
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
  if (item.type !== ProductType.WHEEL) return null;
  const wheel = item as WheelProduct;
  if (wheel.supplierName !== 'ALINE' && !item.id.toUpperCase().includes('ALINE')) return null;
  return {
    id: item.id,
    imageDesignKey: wheel.imageDesignKey,
    imageFinishKey: wheel.imageFinishKey,
    size: wheel.size,
    pcd: wheel.pcd
  };
};

export const fetchSupplierStockImages = async (supplier = 'ALINE'): Promise<SupplierStockImageRow[]> => {
  if (!supplierImageCache.has(supplier)) {
    supplierImageCache.set(supplier, (async () => {
      const { data, error } = await (supabase as any)
        .from('supplier_stock_images')
        .select('id,supplier,design_key,finish_key,rim_size,pcd,tags,file_name,storage_bucket,storage_path,public_image_url,mime_type,active,imported_at,updated_at')
        .eq('supplier', supplier)
        .eq('active', true)
        .order('design_key', { ascending: true })
        .order('file_name', { ascending: true });

      if (error) throw error;
      return data ?? [];
    })());
  }

  return supplierImageCache.get(supplier)!;
};

export const buildSupplierImageMap = (
  items: InventoryItem[],
  imageRows: SupplierStockImageRow[]
): Record<string, string> => {
  const candidatesByDesign = imageRows.reduce<Record<string, SupplierImageMatchCandidate[]>>((groups, row) => {
    const designKey = normalizeSupplierImageToken(row.design_key);
    groups[designKey] = groups[designKey] ?? [];
    groups[designKey].push({
      designKey: row.design_key,
      finishKey: row.finish_key,
      rimSize: row.rim_size,
      pcd: row.pcd,
      publicImageUrl: row.public_image_url,
      fileName: row.file_name
    });
    return groups;
  }, {});

  return items.reduce<Record<string, string>>((imageMap, item) => {
    const lookupItem = inventoryItemToSupplierImageLookup(item);
    if (!lookupItem) return imageMap;

    const candidates = candidatesByDesign[normalizeSupplierImageToken(lookupItem.imageDesignKey)] ?? [];
    const match = findBestSupplierStockImage(lookupItem, candidates);
    if (match.imageUrl) imageMap[item.id] = match.imageUrl;
    return imageMap;
  }, {});
};
