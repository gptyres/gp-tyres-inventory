
import { InventoryItem, ProductType, TyreProduct, CoiloverProduct, WheelProduct, Order, Backorder } from './types';
import { parseAlineStockImageKeys, parseSupplierTyreImageKeys, parseSupplierWheelImageKeys } from './supplierStockImages';
import { STAMFORD_PRICE_BY_SKU } from './supplier_data/stamfordData';

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const normalizeString = (str: string) => {
  if (!str) return '';
  return str.replace(/[\/\-\s]/g, '').toLowerCase();
};

export const getStatusColor = (qty: number) => {
  if (qty === 0) return 'text-gp-red font-bold';
  if (qty < 4) return 'text-orange-500 font-bold';
  return 'text-green-500';
};

// --- ENHANCED FUZZY SEARCH LOGIC ---

// Shared normalization logic for sticky search across all types
const normalizeSearchTerm = (str: string) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/(\d)[xX*](\d)/g, '$1 $2') // standardized separator for dimensions
    .replace(/[^a-z0-9\s]/g, ' '); // remove special chars to create clean tokens
};

/**
 * Robust fuzzy search for inventory items.
 * Handles:
 * - Multi-term matching (e.g. "dunlop 17")
 * - Dimension variations (e.g. "205/40" vs "205 40" vs "20540")
 * - Technical spec variations (e.g. "5x100" vs "5/100" vs "5100")
 * - Specific fields: Pattern, PCD, Colour, Vehicle Compatibility
 */
export const searchInventory = (items: InventoryItem[], query: string): InventoryItem[] => {
  if (!query) return items;

  const normalizedQuery = normalizeSearchTerm(query);
  const terms = normalizedQuery.split(/\s+/).filter(t => t.length > 0);
  
  // Create a purely numeric version of the query for "2054017" style matching
  const numericQuery = query.replace(/[^0-9]/g, '');

  return items.filter((item) => {
    let searchableParts: (string | number | undefined)[] = [];
    let variants: string[] = []; 

    // 2. Build Search Blob based on Product Type
    if (item.type === ProductType.TYRE) {
      const t = item as TyreProduct;
      searchableParts = [
        t.brand,
        t.pattern,
        t.size,
        t.loadSpeedIndex,
        t.location,
        'Tyre'
      ];
      
      // Generate variations for Size (e.g. 265/65R17)
      if (t.size) {
        variants.push(t.size); // Original
        variants.push(t.size.replace(/[^a-zA-Z0-9]/g, '')); // "26565R17"
        variants.push(t.size.replace(/[^0-9]/g, ''));       // "2656517" (Digits only)
        // Add specific parsing for R sizes (e.g. R17 -> 17)
        if (t.size.includes('R')) variants.push(t.size.replace('R', ' '));
      }

    } else if (item.type === ProductType.WHEEL) {
      const w = item as WheelProduct;
      searchableParts = [
        w.code,
        w.size,
        w.pcd,
        w.colour,
        w.offset,
        w.centerBore,
        'Wheel'
      ];
      
      // Variations for Size (e.g. 15x6.5)
      if (w.size) {
        variants.push(w.size.replace(/[^a-zA-Z0-9]/g, '')); 
        variants.push(w.size.replace(/[^0-9]/g, ''));
      }
      // Variations for PCD (e.g. 5/100 -> 5100)
      if (w.pcd) {
        variants.push(w.pcd.replace(/[^a-zA-Z0-9]/g, ''));
        variants.push(w.pcd.replace(/[^0-9]/g, ''));
      }

    } else if (item.type === ProductType.COILOVER) {
      const c = item as CoiloverProduct;
      searchableParts = [
        c.brand,
        c.series,
        c.vehicleCompatibility,
        'Coilover'
      ];
      
      // Variations for Compatibility (e.g. Golf 7 -> Golf7)
      if (c.vehicleCompatibility) {
        variants.push(c.vehicleCompatibility.replace(/[^a-zA-Z0-9]/g, ''));
        variants.push(c.vehicleCompatibility.replace(/\s+/g, ''));
      }
    }

    // 3. Combine Data into a searchable "Blob"
    // Join standard parts and normalize them
    const mainText = normalizeSearchTerm(searchableParts.join(' '));
    // Join variants (keep them raw and lowercased as they are specifically formatted)
    const variantText = variants.join(' ').toLowerCase();
    
    // The "Blob" contains the cleaned text plus specific variations
    const fullBlob = `${mainText} ${variantText}`;

    // 4. Check Matches
    // Strategy A: All terms from query must be present in the full blob (AND logic)
    const standardMatch = terms.every(term => fullBlob.includes(term));
    if (standardMatch) return true;

    // Strategy B: Numeric Fallback (e.g. User typed "2054017")
    // If the query is mostly numbers (len > 3) and that sequence exists in our variant text
    if (numericQuery.length > 3 && variantText.includes(numericQuery)) {
        return true;
    }

    return false;
  });
};

export const searchOrders = (orders: Order[], query: string): Order[] => {
  if (!query) return orders;
  const normalizedQuery = normalizeSearchTerm(query);
  const terms = normalizedQuery.split(/\s+/).filter(t => t.length > 0);
  const numericQuery = query.replace(/[^0-9]/g, '');

  return orders.filter(order => {
    const searchableParts = [
      order.productDescription,
      order.staffName,
      order.terminalId,
      order.id
    ];
    
    const mainText = normalizeSearchTerm(searchableParts.join(' '));
    const variantText = order.productDescription.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const fullBlob = `${mainText} ${variantText}`;

    const standardMatch = terms.every(term => fullBlob.includes(term));
    if (standardMatch) return true;

    if (numericQuery.length > 3 && variantText.includes(numericQuery)) return true;

    return false;
  });
};

export const searchBackorders = (backorders: Backorder[], query: string): Backorder[] => {
  if (!query) return backorders;
  const normalizedQuery = normalizeSearchTerm(query);
  const terms = normalizedQuery.split(/\s+/).filter(t => t.length > 0);
  const numericQuery = query.replace(/[^0-9]/g, '');

  return backorders.filter(bo => {
    const searchableParts = [
      bo.productDescription,
      bo.supplier,
      bo.notes || ''
    ];
    
    const mainText = normalizeSearchTerm(searchableParts.join(' '));
    const variantText = bo.productDescription.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const fullBlob = `${mainText} ${variantText}`;

    const standardMatch = terms.every(term => fullBlob.includes(term));
    if (standardMatch) return true;

    if (numericQuery.length > 3 && variantText.includes(numericQuery)) return true;

    return false;
  });
};

// --- CSV PARSING HELPERS ---

const parseCurrencyString = (val: string): number => {
  if (!val) return 0;
  // Remove R, commas, spaces, quotes
  const clean = val.replace(/[R,\s"']/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
};

// Handles CSV lines with potential quoted fields containing commas
const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuote = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuote && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (char === ',' && !inQuote) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
};

const parseStockUnits = (val: string): number => {
  if (!val) return 0;
  const match = val.match(/-?\d+/);
  return match ? parseInt(match[0], 10) : 0;
};

const splitBrandPattern = (brandPattern: string, fallbackBrand: string) => {
  const cleaned = brandPattern.replace(/\s+/g, ' ').trim();
  const dashParts = cleaned.split(/\s+-\s+/);

  if (dashParts.length > 1) {
    return {
      brand: dashParts[0].trim() || fallbackBrand,
      pattern: dashParts.slice(1).join(' - ').replace(/^TYRES\s+/i, '').trim() || 'Standard'
    };
  }

  const brandParts = cleaned.split(' ');
  return {
    brand: brandParts[0] || fallbackBrand,
    pattern: brandParts.slice(1).join(' ') || 'Standard'
  };
};

const normalizeExclusiveTyrePattern = (brand: string, pattern: string) => {
  const brandKey = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let cleaned = pattern
    .replace(/\bIMP\b/gi, ' ')
    .replace(new RegExp(`^\\s*${brandKey}\\s+`, 'i'), ' ')
    .replace(/\b(?:XL|XLL|BSW|OWL|RWL|WWL|POR)\b/gi, ' ')
    .replace(/\b\d{2,3}\s*\/\s*\d{2,3}\s*[A-Z]\b/gi, ' ')
    .replace(/\b\d{2,3}\s+\d{2,3}\s*[A-Z]\b/gi, ' ')
    .replace(/\b\d{2,3}\s*[A-Z]\b/gi, ' ')
    .replace(/\b(?:E|Z)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  cleaned = cleaned
    .replace(new RegExp(`^\\s*${brandKey}\\s+`, 'i'), ' ')
    .replace(/\b\d{2,3}\s*[A-Z]\b/gi, ' ')
    .replace(/\bPRIVILO\b/gi, 'Privilo')
    .replace(/\bRENEG\.?AT\.?SPORT\b/gi, 'Renegade AT Sport')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || pattern.replace(/\bIMP\b/gi, ' ').replace(/\s+/g, ' ').trim() || 'Standard';
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const supplierTyreImageMetadata = (
  supplierName: string,
  brand: string,
  pattern: string,
  supplierStockCode?: string
) => {
  const imageKeys = parseSupplierTyreImageKeys(brand, pattern);
  return {
    supplierName,
    supplierStockCode,
    imageDesignKey: imageKeys.designKey,
    imageFinishKey: imageKeys.finishKey
  };
};

export const parseRawData = (tyreCsv: string, coiloverCsv: string): InventoryItem[] => {
  const items: InventoryItem[] = [];
  
  // Safety check to prevent crashing if imports fail or data is missing
  if (!tyreCsv || !coiloverCsv) {
    console.warn("CSV data is missing, returning empty inventory.");
    return [];
  }

  let idCounter = 1;

  try {
    // 1. Parse Tyres
    const tyreLines = tyreCsv.split('\n');
    // Skip header if it exists (starts with LOCATION)
    const tyreStartIndex = tyreLines[0]?.startsWith('LOCATION') ? 1 : 0;

    for (let i = tyreStartIndex; i < tyreLines.length; i++) {
      const line = tyreLines[i].trim();
      if (!line) continue;
      
      const cols = parseCSVLine(line);
      // Expected: LOCATION, PRODUCT NAME, DESCRIPTION(SIZE), QUANTITY, COST, SELLING
      if (cols.length < 3) continue;

      const fullBrand = cols[1] || 'Unknown';
      // Naive split: First word is brand, rest is pattern
      const brandParts = fullBrand.split(' ');
      const brand = brandParts[0] || 'Unknown';
      const pattern = brandParts.slice(1).join(' ') || 'Standard';

      const item: TyreProduct = {
        id: `t-${idCounter++}`,
        type: ProductType.TYRE,
        location: cols[0] || 'Unknown',
        brand: brand,
        pattern: pattern,
        size: cols[2] || 'Unknown',
        quantity: parseInt(cols[3] || '0') || 0,
        costPrice: parseCurrencyString(cols[4]),
        sellingPrice: parseCurrencyString(cols[5]),
        loadSpeedIndex: '', // Not explicitly in this CSV structure
        lastUpdated: new Date().toISOString().split('T')[0]
      };
      items.push(item);
    }

    // 2. Parse Coilovers
    const coilLines = coiloverCsv.split('\n');
    // Skip header if exists
    const coilStartIndex = coilLines[0]?.includes('QUANTITY') ? 1 : 0;

    for (let i = coilStartIndex; i < coilLines.length; i++) {
      const line = coilLines[i].trim();
      if (!line) continue;

      const cols = parseCSVLine(line);
      // Expected: BRAND/SERIES, KIT/VEHICLE, QUANTITY, PRICE
      if (cols.length < 4) continue;

      const fullBrand = cols[0] || 'Unknown'; 
      // Usually "ARC YELLOW", "ARC BLUE"
      const brandParts = fullBrand.split(' ');
      const brand = brandParts[0] || 'ARC';
      const series = brandParts.slice(1).join(' ') || fullBrand;

      const item: CoiloverProduct = {
        id: `c-${idCounter++}`,
        type: ProductType.COILOVER,
        brand: brand,
        series: series,
        vehicleCompatibility: cols[1] || 'Universal',
        quantity: parseInt(cols[2] || '0') || 0,
        sellingPrice: parseCurrencyString(cols[3]),
        costPrice: 0, // Not in CSV
        lastUpdated: new Date().toISOString().split('T')[0]
      };
      items.push(item);
    }
  } catch (err) {
    console.error("Failed to parse inventory data:", err);
  }

  return items;
};

// --- SAILUN PARSER ---
export const parseSailunData = (rawText: string): InventoryItem[] => {
  const items: InventoryItem[] = [];
  const lines = rawText.split('\n');
  const today = new Date().toISOString().split('T')[0];

  lines.forEach((line) => {
    // Basic validation: Line needs SAP code (starts with 322...) and reasonable length
    if (!line.trim() || !line.trim().startsWith('322')) return;

    // Split by spaces, handling multiple spaces
    const parts = line.trim().split(/\s+/);
    
    // Expected Minimum Parts: SAP, Factory, Sidewall, Size, Inch, Pattern(1+), LI, SR, Price(1-7)
    // Example: 3220002265 8800 BSW 155/80R13 13 ATREZZO SH406 79 T 553 512 502
    
    if (parts.length < 9) return;

    const size = parts[3];
    
    // Find where numerical stats begin (LI is usually index 6 or 7 depending on Pattern length)
    // We look from the end backwards for the prices
    const price1Index = parts.length - 3; // "1-7" price column
    const nettPrice = parseCurrencyString(parts[price1Index]);
    
    // Calculate VAT (15%)
    const sellingPrice = Math.ceil(nettPrice * 1.15); 

    // Pattern is everything between index 5 and the LI index
    // LI is usually the 3rd to last non-price element? 
    // Let's rely on standard column structure roughly
    // 0:SAP 1:Fact 2:Side 3:Size 4:Inch 5:PatStart ... LI SR PLY? Price1 Price2 Price3
    
    // Heuristic: Load Index is usually 2 or 3 digits followed by a Speed Rating letter
    // Finding index of Load Index
    let liIndex = -1;
    for(let i=5; i < parts.length - 3; i++) {
        if (/^\d{2,3}$/.test(parts[i]) && /^[A-Z]$/.test(parts[i+1])) {
            liIndex = i;
            break;
        }
    }

    let pattern = "Standard";
    let loadIndex = "";
    let speedRating = "";

    if (liIndex > -1) {
        pattern = parts.slice(5, liIndex).join(' ');
        loadIndex = parts[liIndex];
        speedRating = parts[liIndex+1];
    } else {
        // Fallback if regex fails, assume pattern is index 5+6
        pattern = parts[5] + (parts[6] ? " " + parts[6] : "");
    }

    const loadSpeed = `${loadIndex}${speedRating}`;

    const item: TyreProduct = {
        id: parts[0], // Use SAP as ID
        type: ProductType.TYRE,
        ...supplierTyreImageMetadata('SAILUN', 'Sailun', pattern, parts[0]),
        brand: 'Sailun',
        pattern: pattern,
        size: size,
        loadSpeedIndex: loadSpeed,
        location: 'Supplier',
        quantity: 100, // Dummy high quantity for supplier view
        costPrice: nettPrice,
        sellingPrice: sellingPrice, // VAT Inclusive
        lastUpdated: today
    };

    items.push(item);
  });

  return items;
};

// --- EXCLUSIVE TYRES PARSER ---
export const parseExclusiveTyresData = (rawCsv: string): InventoryItem[] => {
  const items: InventoryItem[] = [];
  const lines = rawCsv.split('\n');
  const today = new Date().toISOString().split('T')[0];
  let idCounter = 1;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const cols = parseCSVLine(trimmed);
    const size = cols[0]?.trim();
    const brandPattern = cols[1]?.replace(/\s+/g, ' ').trim();

    if (index === 0 && size?.toUpperCase() === 'TYRE SIZE') return;
    if (!size || !brandPattern) return;

    const dashParts = brandPattern.split(/\s+-\s+/);
    let brand = '';
    let pattern = '';

    if (dashParts.length > 1) {
      brand = dashParts[0].trim();
      pattern = dashParts.slice(1).join(' - ').replace(/^TYRES\s+/i, '').trim();
    } else {
      const brandParts = brandPattern.split(' ');
      brand = brandParts[0] || 'Exclusive';
      pattern = brandParts.slice(1).join(' ') || 'Standard';
    }

    pattern = normalizeExclusiveTyrePattern(brand, pattern);

    const qtyMatch = (cols[3] || '').match(/-?\d+/);
    const quantity = qtyMatch ? parseInt(qtyMatch[0], 10) : 0;
    const priceIncVat = parseCurrencyString(cols[2]);

    const itemId = `exclusive-${idCounter++}`;
    const item: TyreProduct = {
      id: itemId,
      type: ProductType.TYRE,
      ...supplierTyreImageMetadata('EXCLUSIVE TYRES', brand, pattern, itemId),
      brand,
      pattern,
      size,
      loadSpeedIndex: '',
      location: 'EXCLUSIVE TYRES',
      quantity,
      costPrice: priceIncVat,
      sellingPrice: priceIncVat,
      lastUpdated: today
    };

    items.push(item);
  });

  return items;
};

const parseSimpleSupplierCsv = (rawCsv: string, idPrefix: string, supplierName: string): InventoryItem[] => {
  const items: InventoryItem[] = [];
  const lines = rawCsv.split('\n');
  const today = new Date().toISOString().split('T')[0];
  let idCounter = 1;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const cols = parseCSVLine(trimmed);
    const size = cols[0]?.trim();
    const brandPattern = cols[1]?.trim();

    if (index === 0 && size?.toUpperCase() === 'SIZE') return;
    if (!size || !brandPattern) return;

    const { brand, pattern } = splitBrandPattern(brandPattern, supplierName);
    const category = cols[2]?.trim() || supplierName;
    const priceIncVat = parseCurrencyString(cols[3]);
    const quantity = parseStockUnits(cols[4]);

    const itemId = `${idPrefix}-${idCounter++}`;
    items.push({
      id: itemId,
      type: ProductType.TYRE,
      ...supplierTyreImageMetadata(supplierName, brand, pattern, itemId),
      brand,
      pattern,
      size,
      loadSpeedIndex: '',
      location: category,
      quantity,
      costPrice: priceIncVat,
      sellingPrice: priceIncVat,
      lastUpdated: today
    });
  });

  return items;
};

// --- TYREWAREHOUSE PARSER ---
export const parseTyreWarehouseData = (rawCsv: string): InventoryItem[] => {
  const groupedItems = new Map<string, {
    sku: string;
    size: string;
    brand: string;
    pattern: string;
    category: string;
    branchStock: Record<string, number>;
    totalQuantity: number;
    price: number;
  }>();
  const lines = rawCsv.split('\n');
  const today = new Date().toISOString().split('T')[0];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const cols = parseCSVLine(trimmed);
    const sku = cols[0]?.trim();
    const size = cols[1]?.trim();
    const brand = cols[2]?.trim();
    const pattern = cols[3]?.replace(/\s+/g, ' ').trim();
    const category = cols[4]?.trim() || 'TYREWAREHOUSE';
    const stockLocation = cols[5]?.trim() || 'Supplier';

    if (index === 0 && sku?.toUpperCase() === 'SKU') return;
    if (!sku || !size || !brand || !pattern) return;

    const quantity = parseStockUnits(cols[7] || cols[6]);
    const price = parseCurrencyString(cols[8]);
    const existing = groupedItems.get(sku) ?? {
      sku,
      size,
      brand,
      pattern,
      category,
      branchStock: {},
      totalQuantity: 0,
      price
    };

    existing.branchStock[stockLocation] = (existing.branchStock[stockLocation] || 0) + quantity;
    existing.totalQuantity += quantity;
    if (!existing.price && price) existing.price = price;
    groupedItems.set(sku, existing);
  });

  return Array.from(groupedItems.values()).map((entry, index) => {
    const branchLocations = ['JHB', 'GLK', 'CPT', 'DBN'];
    const knownBranches = branchLocations.filter((branch) => branch in entry.branchStock);
    const otherBranches = Object.keys(entry.branchStock).filter((branch) => !branchLocations.includes(branch)).sort();
    const location = [...knownBranches, ...otherBranches]
      .map((branch) => `${branch}: ${entry.branchStock[branch]}`)
      .join(' | ');

    return {
      id: `tyrewarehouse-${index + 1}`,
      type: ProductType.TYRE,
      ...supplierTyreImageMetadata('TYREWAREHOUSE', entry.brand, entry.pattern, entry.sku),
      brand: entry.brand,
      pattern: entry.pattern,
      size: entry.size,
      loadSpeedIndex: [entry.sku, entry.category].filter(Boolean).join(' | '),
      location: location || 'TYREWAREHOUSE',
      quantity: entry.totalQuantity,
      costPrice: entry.price,
      sellingPrice: entry.price,
      lastUpdated: today
    };
  });
};

// --- ATT PARSER ---
export const parseAttData = (rawCsv: string): InventoryItem[] => {
  return parseSimpleSupplierCsv(rawCsv, 'att', 'ATT');
};

// --- SAFETY GRIP PARSER ---
export const parseSafetyGripData = (rawCsv: string): InventoryItem[] => {
  const items: InventoryItem[] = [];
  const lines = rawCsv.split('\n');
  const today = new Date().toISOString().split('T')[0];
  let idCounter = 1;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const cols = parseCSVLine(trimmed);
    const code = cols[0]?.trim();
    const description = cols[1]?.replace(/\s+/g, ' ').trim();

    if (index === 0 && code?.toUpperCase() === 'CODE') return;
    if (!code || !description) return;

    const [size, ...brandPatternParts] = description.split(/\s+/).filter(Boolean);
    const brandPattern = brandPatternParts.join(' ');
    if (!size || !brandPattern) return;

    const { brand, pattern } = splitBrandPattern(brandPattern, 'SAFETY GRIP');
    const quantity = parseStockUnits(cols[2]);
    const priceExVat = parseCurrencyString(cols[3]);
    const priceIncVat = Number((priceExVat * 1.15).toFixed(2));

    const itemId = `safetygrip-${idCounter++}`;
    items.push({
      id: itemId,
      type: ProductType.TYRE,
      ...supplierTyreImageMetadata('SAFETY GRIP', brand, pattern, code),
      brand,
      pattern,
      size,
      loadSpeedIndex: code,
      location: 'SAFETY GRIP',
      quantity,
      costPrice: priceExVat,
      sellingPrice: priceIncVat,
      lastUpdated: today
    });
  });

  return items;
};

// --- STAMFORD PARSER ---
export const parseStamfordData = (
  rawCsv: string,
  priceBySku: Record<string, number> = STAMFORD_PRICE_BY_SKU
): InventoryItem[] => {
  const groupedItems = new Map<string, {
    sku: string;
    brand: string;
    pattern: string;
    size: string;
    category: string;
    branchStock: Record<string, number>;
    totalQuantity: number;
  }>();
  const lines = rawCsv.split('\n');
  const today = new Date().toISOString().split('T')[0];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const cols = parseCSVLine(trimmed);
    const sku = cols[0]?.trim();
    const brand = cols[1]?.trim();
    const pattern = cols[2]?.replace(/\s+/g, ' ').trim();
    const size = cols[3]?.trim();
    const category = cols[4]?.trim() || 'STAMFORD';
    const stockLocation = cols[5]?.trim() || 'Supplier';

    if (index === 0 && sku?.toUpperCase() === 'SKU') return;
    if (!sku || !brand || !pattern || !size) return;

    const quantity = parseStockUnits(cols[7] || cols[6]);
    const existing = groupedItems.get(sku) ?? {
      sku,
      brand,
      pattern,
      size,
      category,
      branchStock: {},
      totalQuantity: 0
    };

    existing.branchStock[stockLocation] = (existing.branchStock[stockLocation] || 0) + quantity;
    existing.totalQuantity += quantity;
    groupedItems.set(sku, existing);
  });

  return Array.from(groupedItems.values()).map((entry, index) => {
    const branchLocations = ['Cape Town', 'Durban', 'Johannesburg'];
    const location = branchLocations
      .filter((branch) => branch in entry.branchStock)
      .map((branch) => `${branch}: ${entry.branchStock[branch]}`)
      .join(' | ');
    const price = priceBySku[entry.sku] ?? 0;

    return {
      id: `stamford-${index + 1}`,
      type: ProductType.TYRE,
      ...supplierTyreImageMetadata('STAMFORD', entry.brand, entry.pattern, entry.sku),
      brand: entry.brand,
      pattern: entry.pattern,
      size: entry.size,
      loadSpeedIndex: [entry.sku, entry.category].filter(Boolean).join(' | '),
      location: location || 'STAMFORD',
      quantity: entry.totalQuantity,
      costPrice: price,
      sellingPrice: price,
      lastUpdated: today
    };
  });
};

const parseAlineWheelSpec = (description: string) => {
  const compact = description.replace(/\s+/g, '');
  const specMatch = compact.match(/^(\d)(\d{3})(\d{2})X([\d.]+)/i);
  const offsetMatch = description.match(/\bET\s*(-?\d+)/i);
  const centerBoreMatch = description.match(/\b(\d{2,3}\.\d)\b/);

  return {
    size: specMatch ? `${specMatch[3]}x${specMatch[4]}` : 'Accessory',
    pcd: specMatch ? `${specMatch[1]}/${specMatch[2]}` : '',
    offset: offsetMatch ? offsetMatch[1] : '',
    centerBore: centerBoreMatch ? centerBoreMatch[1] : ''
  };
};

const normalizeWheelSize = (value: string): string => (
  value
    .replace(/[“”"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*x\s*/i, 'x')
);

// --- ALINE PARSER ---
export const parseAlineData = (rawCsv: string): InventoryItem[] => {
  const items: InventoryItem[] = [];
  const lines = rawCsv.split('\n');
  const today = new Date().toISOString().split('T')[0];
  let idCounter = 1;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const cols = parseCSVLine(trimmed);
    const stockCode = cols[0]?.trim();
    const brand = cols[1]?.trim();
    const description = cols[2]?.replace(/\s+/g, ' ').trim();

    if (index === 0 && stockCode?.toUpperCase() === 'STOCK CODE') return;
    if (!stockCode || !description) return;

    const qtyJhb = parseStockUnits(cols[5]);
    const qtyCpt = parseStockUnits(cols[6]);
    const qtyDbn = parseStockUnits(cols[7]);
    const priceIncVat = parseCurrencyString(cols[8]);
    const recommendedRetail = parseCurrencyString(cols[9]);
    const category = cols[4]?.trim();
    const catalogueNumber = cols[10]?.trim();
    const spec = parseAlineWheelSpec(description);
    const imageKeys = parseAlineStockImageKeys(description);

    items.push({
      id: `aline-${idCounter++}`,
      type: ProductType.WHEEL,
      supplierName: 'ALINE',
      supplierStockCode: stockCode,
      imageDesignKey: imageKeys.designKey,
      imageFinishKey: imageKeys.finishKey,
      code: stockCode,
      size: spec.size,
      pcd: spec.pcd,
      offset: spec.offset,
      centerBore: spec.centerBore,
      colour: [brand, description, category, catalogueNumber, recommendedRetail ? `RR ${formatCurrency(recommendedRetail)}` : ''].filter(Boolean).join(' | '),
      setQuantity: 4,
      location: `JHB: ${qtyJhb} | CPT: ${qtyCpt} | DBN: ${qtyDbn}`,
      quantity: qtyJhb + qtyCpt + qtyDbn,
      costPrice: priceIncVat,
      sellingPrice: priceIncVat,
      lastUpdated: today
    });
  });

  return items;
};

// --- APEX PARSER ---
export const parseApexData = (rawCsv: string): InventoryItem[] => {
  return parseSimpleSupplierCsv(rawCsv, 'apex', 'APEX');
};

// --- TUBESTONE PARSER ---
export const parseTubestoneData = (rawCsv: string): InventoryItem[] => {
  const items: InventoryItem[] = [];
  const lines = rawCsv.split('\n');
  const today = new Date().toISOString().split('T')[0];
  let idCounter = 1;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const cols = parseCSVLine(trimmed);
    const size = cols[0]?.trim();
    const sku = cols[1]?.trim();
    const brand = cols[2]?.trim();
    const description = cols[3]?.replace(/\s+/g, ' ').trim();
    const category = cols[4]?.trim();

    if (index === 0 && size?.toUpperCase() === 'SIZE') return;
    if (!size || !brand || !description) return;

    const bfnQty = parseStockUnits(cols[6]);
    const cptQty = parseStockUnits(cols[7]);
    const dbnQty = parseStockUnits(cols[8]);
    const jhbQty = parseStockUnits(cols[9]);
    const nwhQty = parseStockUnits(cols[10]);
    const totalQty = parseStockUnits(cols[11]);
    const sellingPrice = parseCurrencyString(cols[5]);
    const pattern = description
      .replace(new RegExp(escapeRegExp(size), 'i'), '')
      .replace(new RegExp(escapeRegExp(brand), 'i'), '')
      .replace(/\b\d+\s*PR\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim() || sku || 'Standard';

    const itemId = `tubestone-${idCounter++}`;
    items.push({
      id: itemId,
      type: ProductType.TYRE,
      ...supplierTyreImageMetadata('TUBESTONE', brand, pattern, sku || itemId),
      brand,
      pattern,
      size,
      loadSpeedIndex: [sku, category].filter(Boolean).join(' | '),
      location: `BFN: ${bfnQty} | CPT: ${cptQty} | DBN: ${dbnQty} | JHB: ${jhbQty} | NWH: ${nwhQty}`,
      quantity: totalQty,
      costPrice: sellingPrice,
      sellingPrice,
      lastUpdated: today
    });
  });

  return items;
};

// --- TREADS UNLIMITED PARSER ---
export const parseTreadsUnlimitedData = (rawCsv: string): InventoryItem[] => {
  const items: InventoryItem[] = [];
  const lines = rawCsv.split('\n');
  const today = new Date().toISOString().split('T')[0];
  let idCounter = 1;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const cols = parseCSVLine(trimmed);
    const size = cols[0]?.trim();
    const sku = cols[1]?.trim();
    const brand = cols[2]?.trim();
    const description = cols[3]?.replace(/\s+/g, ' ').trim();

    if (index === 0 && size?.toUpperCase() === 'SIZE') return;
    if (!size || !brand || !description) return;

    const regionalQty = parseStockUnits(cols[5]);
    const nationalQty = parseStockUnits(cols[6]);
    const priceIncVat = parseCurrencyString(cols[4]);
    const pattern = description
      .replace(new RegExp(escapeRegExp(brand), 'i'), '')
      .replace(new RegExp(escapeRegExp(size), 'i'), '')
      .replace(/\s+/g, ' ')
      .trim() || sku || 'Standard';

    const itemId = `treads-${idCounter++}`;
    items.push({
      id: itemId,
      type: ProductType.TYRE,
      ...supplierTyreImageMetadata('TREADS UNLIMITED', brand, pattern, sku || itemId),
      brand,
      pattern,
      size,
      loadSpeedIndex: sku || '',
      location: `Regional: ${regionalQty} | National: ${nationalQty}`,
      quantity: nationalQty,
      costPrice: priceIncVat,
      sellingPrice: priceIncVat,
      lastUpdated: today
    });
  });

  return items;
};

// --- TREAD ZONE PARSER ---
export const parseTreadZoneData = (rawCsv: string): InventoryItem[] => {
  const groupedItems = new Map<string, {
    sku: string;
    category: string;
    brand: string;
    pattern: string;
    size: string;
    branchStock: Record<string, number>;
    totalQuantity: number;
    price: number;
  }>();
  const lines = rawCsv.split('\n');
  const today = new Date().toISOString().split('T')[0];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const cols = parseCSVLine(trimmed);
    const sku = cols[0]?.trim();
    const category = cols[1]?.trim() || 'TREAD ZONE';
    const brand = cols[2]?.trim();
    const pattern = cols[3]?.replace(/\s+/g, ' ').trim();
    const size = cols[4]?.trim();
    const stockLocation = cols[5]?.replace(/^Treadzone\s*/i, '').trim() || 'Supplier';

    if (index === 0 && sku?.toUpperCase() === 'SKU') return;
    if (!sku || !brand || !pattern || !size) return;

    const quantity = parseStockUnits(cols[7] || cols[6]);
    const price = parseCurrencyString(cols[8]);
    const existing = groupedItems.get(sku) ?? {
      sku,
      category,
      brand,
      pattern,
      size,
      branchStock: {},
      totalQuantity: 0,
      price
    };

    existing.branchStock[stockLocation] = (existing.branchStock[stockLocation] || 0) + quantity;
    existing.totalQuantity += quantity;
    if (!existing.price && price) existing.price = price;
    groupedItems.set(sku, existing);
  });

  return Array.from(groupedItems.values()).map((entry, index) => {
    const branchLocations = ['Cape Town', 'Durban', 'Jet Park', 'Port Elizabeth'];
    const location = branchLocations
      .filter((branch) => branch in entry.branchStock)
      .map((branch) => `${branch}: ${entry.branchStock[branch]}`)
      .join(' | ');

    return {
      id: `treadzone-${index + 1}`,
      type: ProductType.TYRE,
      ...supplierTyreImageMetadata('TREAD ZONE', entry.brand, entry.pattern, entry.sku),
      brand: entry.brand,
      pattern: entry.pattern,
      size: entry.size,
      loadSpeedIndex: [entry.sku, entry.category].filter(Boolean).join(' | '),
      location: location || 'TREAD ZONE',
      quantity: entry.totalQuantity,
      costPrice: entry.price,
      sellingPrice: entry.price,
      lastUpdated: today
    };
  });
};

// --- SUMITOMO/DUNLOP PARSER ---
export const parseSumitomoDunlopData = (rawCsv: string): InventoryItem[] => {
  const groupedItems = new Map<string, {
    sku: string;
    category: string;
    brand: string;
    pattern: string;
    size: string;
    branchStock: Record<string, number>;
    totalQuantity: number;
    price: number;
  }>();
  const lines = rawCsv.split('\n');
  const today = new Date().toISOString().split('T')[0];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const cols = parseCSVLine(trimmed);
    const sku = cols[0]?.trim();
    const category = cols[1]?.trim() || 'SUMITOMO/DUNLOP';
    const brand = cols[2]?.trim();
    const pattern = cols[3]?.replace(/\s+/g, ' ').trim();
    const size = cols[4]?.trim();
    const stockLocation = cols[5]?.trim() || 'Supplier';

    if (index === 0 && sku?.toUpperCase() === 'SKU') return;
    if (!sku || !brand || !pattern || !size) return;

    const quantity = parseStockUnits(cols[7] || cols[6]);
    const price = parseCurrencyString(cols[8]);
    const existing = groupedItems.get(sku) ?? {
      sku,
      category,
      brand,
      pattern,
      size,
      branchStock: {},
      totalQuantity: 0,
      price
    };

    existing.branchStock[stockLocation] = (existing.branchStock[stockLocation] || 0) + quantity;
    existing.totalQuantity += quantity;
    if (!existing.price && price) existing.price = price;
    groupedItems.set(sku, existing);
  });

  return Array.from(groupedItems.values()).map((entry, index) => {
    const branchLocations = [
      'Cape Town',
      'Durban',
      'Durban CDC',
      'Eastport',
      'Inbound To Cape Town',
      'Ladysmith',
      'No Stock Listed',
      'Port Elizabeth'
    ];
    const knownBranches = branchLocations.filter((branch) => branch in entry.branchStock);
    const otherBranches = Object.keys(entry.branchStock).filter((branch) => !branchLocations.includes(branch)).sort();
    const location = [...knownBranches, ...otherBranches]
      .map((branch) => `${branch}: ${entry.branchStock[branch]}`)
      .join(' | ');

    return {
      id: `sumitomo-dunlop-${index + 1}`,
      type: ProductType.TYRE,
      ...supplierTyreImageMetadata('SUMITOMO/DUNLOP', entry.brand, entry.pattern, entry.sku),
      brand: entry.brand,
      pattern: entry.pattern,
      size: entry.size,
      loadSpeedIndex: [entry.sku, entry.category].filter(Boolean).join(' | '),
      location: location || 'SUMITOMO/DUNLOP',
      quantity: entry.totalQuantity,
      costPrice: entry.price,
      sellingPrice: entry.price,
      lastUpdated: today
    };
  });
};

// --- TYRE LIFE PARSER ---
export const parseTyreLifeData = (rawCsv: string): InventoryItem[] => {
  const items: InventoryItem[] = [];
  const lines = rawCsv.split('\n');
  const today = new Date().toISOString().split('T')[0];
  let idCounter = 1;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const cols = parseCSVLine(trimmed);
    const size = cols[0]?.trim();
    const sku = cols[1]?.trim();
    const brand = cols[2]?.trim();
    const pattern = cols[3]?.replace(/\s+/g, ' ').trim();

    if (index === 0 && size?.toUpperCase() === 'SIZE') return;
    if (!size || !brand || !pattern) return;

    const jhbQty = parseStockUnits(cols[9]);
    const cptQty = parseStockUnits(cols[10]);
    const dbnQty = parseStockUnits(cols[11]);
    const totalQty = parseStockUnits(cols[12]);
    const priceIncVat = parseCurrencyString(cols[8]);
    const loadSpeed = `${cols[4] || ''}${cols[5] || ''}${cols[6] ? ` ${cols[6]}` : ''}`.trim();

    const itemId = `tyrelife-${idCounter++}`;
    items.push({
      id: itemId,
      type: ProductType.TYRE,
      ...supplierTyreImageMetadata('TYRE LIFE', brand, pattern, sku || itemId),
      brand,
      pattern,
      size,
      loadSpeedIndex: loadSpeed || sku || '',
      location: `JHB: ${jhbQty} | CPT: ${cptQty} | DBN: ${dbnQty}`,
      quantity: totalQty,
      costPrice: priceIncVat,
      sellingPrice: priceIncVat,
      lastUpdated: today
    });
  });

  return items;
};

// --- TYRE LIFE WHEELS PARSER ---
export const parseTyreLifeWheelsData = (rawCsv: string): InventoryItem[] => {
  const items: InventoryItem[] = [];
  const lines = rawCsv.split('\n');
  const today = new Date().toISOString().split('T')[0];
  let idCounter = 1;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const cols = parseCSVLine(trimmed);
    const rawSize = cols[0]?.trim();
    const sku = cols[1]?.trim();
    const brand = cols[2]?.trim();
    const wheelName = cols[3]?.replace(/\s+/g, ' ').trim();
    const finish = cols[4]?.replace(/\s+/g, ' ').trim();

    if (index === 0 && rawSize?.toUpperCase() === 'SIZE') return;
    if (!rawSize || !sku || !wheelName) return;

    const pcd = cols[5]?.trim() || '';
    const offset = cols[6]?.trim() || '';
    const centerBore = cols[7]?.trim() || '';
    const category = cols[8]?.trim() || 'Wheels';
    const sellingPrice = parseCurrencyString(cols[9]);
    const jhbQty = parseStockUnits(cols[10]);
    const cptQty = parseStockUnits(cols[11]);
    const dbnQty = parseStockUnits(cols[12]);
    const totalQty = parseStockUnits(cols[13]);
    const quantity = totalQty || jhbQty + cptQty + dbnQty;
    const itemId = `tyrelifewheels-${idCounter++}`;
    const imageKeys = parseSupplierWheelImageKeys(brand, wheelName, finish, sku);

    items.push({
      id: itemId,
      type: ProductType.WHEEL,
      supplierName: 'TYRE LIFE WHEELS',
      supplierStockCode: sku,
      imageDesignKey: imageKeys.designKey,
      imageFinishKey: imageKeys.finishKey,
      code: wheelName,
      size: normalizeWheelSize(rawSize),
      pcd,
      offset,
      centerBore,
      colour: [brand, finish, category, sku].filter(Boolean).join(' | '),
      setQuantity: 4,
      location: `JHB: ${jhbQty} | CPT: ${cptQty} | DBN: ${dbnQty}`,
      quantity,
      costPrice: sellingPrice,
      sellingPrice,
      lastUpdated: today
    });
  });

  return items;
};
