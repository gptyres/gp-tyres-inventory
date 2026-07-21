
import { InventoryItem, ProductType, TyreProduct, CoiloverProduct, WheelProduct, Order, Backorder } from './types';
import { parseAlineWheelDescription, parseSupplierTyreImageKeys, parseSupplierWheelImageKeys } from './supplierStockImages';
import { buildTyreIndexDisplay, parseSupplierTyreFields } from './supplierTyreParsing';

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

interface InventorySearchIndex {
  fullBlob: string;
  variantText: string;
}

const inventorySearchIndexCache = new WeakMap<InventoryItem, InventorySearchIndex>();

const getInventorySearchIndex = (item: InventoryItem): InventorySearchIndex => {
  const cached = inventorySearchIndexCache.get(item);
  if (cached) return cached;

  let searchableParts: (string | number | undefined)[] = [];
  const variants: string[] = [];

  if (item.type === ProductType.TYRE) {
    const tyre = item as TyreProduct;
    searchableParts = [
      tyre.brand,
      tyre.pattern,
      tyre.size,
      tyre.loadSpeedIndex,
      tyre.location,
      'Tyre'
    ];

    if (tyre.size) {
      variants.push(tyre.size);
      variants.push(tyre.size.replace(/[^a-zA-Z0-9]/g, ''));
      variants.push(tyre.size.replace(/[^0-9]/g, ''));
      if (tyre.size.includes('R')) variants.push(tyre.size.replace('R', ' '));
    }
  } else if (item.type === ProductType.WHEEL) {
    const wheel = item as WheelProduct;
    searchableParts = [
      wheel.code,
      wheel.size,
      wheel.pcd,
      wheel.colour,
      wheel.offset,
      wheel.centerBore,
      'Wheel'
    ];

    if (wheel.size) {
      variants.push(wheel.size.replace(/[^a-zA-Z0-9]/g, ''));
      variants.push(wheel.size.replace(/[^0-9]/g, ''));
    }
    if (wheel.pcd) {
      variants.push(wheel.pcd.replace(/[^a-zA-Z0-9]/g, ''));
      variants.push(wheel.pcd.replace(/[^0-9]/g, ''));
    }
  } else if (item.type === ProductType.COILOVER) {
    const coilover = item as CoiloverProduct;
    searchableParts = [
      coilover.brand,
      coilover.series,
      coilover.vehicleCompatibility,
      'Coilover'
    ];

    if (coilover.vehicleCompatibility) {
      variants.push(coilover.vehicleCompatibility.replace(/[^a-zA-Z0-9]/g, ''));
      variants.push(coilover.vehicleCompatibility.replace(/\s+/g, ''));
    }
  }

  const mainText = normalizeSearchTerm(searchableParts.join(' '));
  const variantText = variants.join(' ').toLowerCase();
  const index = {
    fullBlob: `${mainText} ${variantText}`,
    variantText
  };

  inventorySearchIndexCache.set(item, index);
  return index;
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
    const { fullBlob, variantText } = getInventorySearchIndex(item);

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
  const brandCodeNoise: Record<string, RegExp> = {
    BRIDGESTONE: /\b(?:BST|BRIDGSTONE)\b/gi,
    DUNLOP: /\bDUN\b/gi,
    FIRESTONE: /\bFST\b/gi,
    GOODYEAR: /\b(?:GDY|GOODYE|GOODYEA)\b/gi,
    WINDFORCE: /\b(?:WINDFO|WINDFORC)\b/gi,
    CONTINENTAL: /\b(?:CON|CONTINETAL)\b/gi,
    DRIVEMASTER: /\b(?:DRIVE\s*MASTER|DRMASTER)\b/gi,
    GENERAL: /\bGEN\b/gi,
    LANDSPIDER: /\bLANDSPIDE\b/gi,
    ANCHEE: /\bACHEE\b/gi
  };
  let cleaned = pattern
    .replace(/\bIMP\b/gi, ' ')
    .replace(/\bTYRES?\b/gi, ' ')
    .replace(new RegExp(`^\\s*${brandKey}\\s+`, 'i'), ' ')
    .replace(new RegExp(`\\b${brandKey}\\b`, 'gi'), ' ')
    .replace(brandCodeNoise[brand.toUpperCase()] ?? /$a/, ' ')
    .replace(/\b(?:XL|XLL|BSW|OWL|RWL|WWL|POR|TL|T\/L|TUBELESS|RFT|RUN\s*FLAT|RF|RSC|MIT|FP|WSW|MFS|MOE|MO|AO|NF0|RHD|LHD|RBT|OWT|STD)\b/gi, ' ')
    .replace(/\b(?:3PSF|3PMSF|M\+S|SAF)\b/gi, ' ')
    .replace(/\bRENEGADE\s+A\s*T\s+5\b/gi, 'Renegade AT5')
    .replace(/\bRENEGADE\s+AT\s+5\b/gi, 'Renegade AT5')
    .replace(/\bDIMAX\s+AS\s+([68])\b/gi, 'DIMAX AS$1')
    .replace(/\b\d{1,2}\s*PR\b/gi, ' ')
    .replace(/\b\d{2,3}[A-Z]+XL\b/gi, ' ')
    .replace(/\b\d{2,3}\s*TR\d{2}\b/gi, ' ')
    .replace(/\b\d{2,3}\s*HR\d{2}\b/gi, ' ')
    .replace(/\bR\d{2}LT\b/gi, ' ')
    .replace(/\b\d{1,3}\s+\d{1,3}\s*[A-Z]\b/gi, ' ')
    .replace(/\b\d{2,3}\s*\/\s*\d{2,3}\s*[A-Z]\b/gi, ' ')
    .replace(/\b\d{2,3}\s+\d{2,3}R\d{2}\b/gi, ' ')
    .replace(/\b\d{2,3}\s+\d{2,3}RF\d{2}\b/gi, ' ')
    .replace(/\b\d{2,3}\s+\d{2,3}ZR\d{2}\b/gi, ' ')
    .replace(/\b\d{2,3}\/\d{2,3}R\d{2}(?:\.\d)?\b/gi, ' ')
    .replace(/\b\d{2,3}\/\d{2,3}RF\d{2}\b/gi, ' ')
    .replace(/\b\d{2,3}\/\d{2,3}ZR\d{2}\b/gi, ' ')
    .replace(/\b\d{2,3}X\d{2}(?:\.\d+)?(?:R\d+)?(?:LT)?\b/gi, ' ')
    .replace(/\b\d{2,3}\.\d{2}R\d{2}\b/gi, ' ')
    .replace(/\b\d{2,3}\s*[A-Z]\b/gi, ' ')
    .replace(/\b(?:E|Z)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  cleaned = cleaned
    .replace(new RegExp(`^\\s*${brandKey}\\s+`, 'i'), ' ')
    .replace(new RegExp(`\\b${brandKey}\\b`, 'gi'), ' ')
    .replace(brandCodeNoise[brand.toUpperCase()] ?? /$a/, ' ')
    .replace(/\b\d{2,3}\s*[A-Z]\b/gi, ' ')
    .replace(/\bPRIVILO\b/gi, 'Privilo')
    .replace(/\bRENEG\.?AT\.?5\b/gi, 'Renegade AT5')
    .replace(/\bRENEG\.?AT\.?SPORT\b/gi, 'Renegade AT Sport')
    .replace(/\bRENEG\.?RT\+?\b/gi, 'Renegade RT+')
    .replace(/\bDMAX\b/gi, 'DIMAX')
    .replace(/\bRENEG\.?\b/gi, 'Renegade')
    .replace(/\bA\s*T\b/gi, 'AT')
    .replace(/\bR\s*T\b/gi, 'RT')
    .replace(/\bM\s*T\b/gi, 'MT')
    .replace(/\bAT\s+5\b/gi, 'AT5')
    .replace(/\bR\s*F\b/gi, ' ')
    .replace(/\b(?:C|D|E|F)\s+(Renegade)\b/gi, '$1')
    .replace(/^[.\s]+/g, ' ')
    .replace(/^\d+(?:[.\s]+)?/g, ' ')
    .replace(/\b(?:H|V|W|Y|S|T|Q|R|L|K|J)\b$/gi, ' ')
    .replace(/\bX\s*PRIVILO\s*TX\s*([0-9])\b/gi, 'X Privilo TX$1')
    .replace(/\bRPX\s*[\-.]?\s*800\b/gi, 'RPX800')
    .replace(/\bRLT\s*[\-.]?\s*71\b/gi, 'RLT71')
    .replace(/\bRLT71\s*35MM\b/gi, 'RLT71')
    .replace(/\bRT\++(?!\w)/gi, 'RT+')
    .replace(/\bRenegade\s*RT\++/gi, 'Renegade RT+')
    .replace(/\bRenegade\s*X\b/gi, 'Renegade X')
    .replace(/\bDIMAX\s*[\-.]\s*CLASSIC\b/gi, 'DIMAX CLASSIC')
    .replace(/\bDIMAX\s*[\-.]\s*R8\b/gi, 'DIMAX R8')
    .replace(/\bDIMAX\s*R8\+?(?!\w)/gi, 'DIMAX R8+')
    .replace(/\bDIMAX\s+AS([68])\b/gi, 'DIMAX AS $1')
    .replace(/\bCATCHFORS\s+H\s+P\b/gi, 'CATCHFORS HP')
    .replace(/\bCATCHFORS\s+H\s+T\b/gi, 'CATCHFORS HT')
    .replace(/\bCATCHFORS\s+A\s*T\s+II\b/gi, 'CATCHFORS AT II')
    .replace(/\bLS588\s+(?:UHP|U|W|S|SUV)\b/gi, 'LS588')
    .replace(/\bLS588\s+\d+[A-Z]*Z?\b/gi, 'LS588')
    .replace(/\bEAG\s*F1\b/gi, 'Eagle F1')
    .replace(/[()]/g, ' ')
    .replace(/\bPIR\b/gi, ' ')
    .replace(/\bASYMM?\b/gi, 'Asymmetric')
    .replace(/\bASY\s*([2356])\+?\b/gi, 'Asymmetric $1')
    .replace(/\bAST\s*3SUV\b/gi, 'Asymmetric 3 SUV')
    .replace(/\bWRL?\s+AT\s+ADV(?:ENTURE)?\b/gi, 'Wrangler AT Adventure')
    .replace(/\bWRL?\s+AT\s+S\b/gi, 'Wrangler AT/S')
    .replace(/\bWRL?\s+DURATRAC\s*RTFPOWL\b/gi, 'Wrangler DuraTrac RT')
    .replace(/\bWRL?\s+DURATRACTFPOWL\b/gi, 'Wrangler DuraTrac')
    .replace(/\bEFFICIENT\s*GRIP\b/gi, 'EfficientGrip')
    .replace(/\bEFFIGRIP\b/gi, 'EfficientGrip')
    .replace(/\bPERF\b/gi, 'Performance')
    .replace(/\bDURAMAX\b/gi, 'DuraMax')
    .replace(/\bSPVAN01\b/gi, 'SP Van01')
    .replace(/\bRADIAL\s*913\s*FM\b/gi, 'FM913')
    .replace(/\bPC\s*5\b/gi, 'ContiPremiumContact 5')
    .replace(/\bPC\s*6\b/gi, 'PremiumContact 6')
    .replace(/\bPC\s*7\b/gi, 'PremiumContact 7')
    .replace(/\bCONTIPREMIUMCONTACT\s+5\s+CONTIPREMIUM\s+CONTACT\s+5\b/gi, 'ContiPremiumContact 5')
    .replace(/\bCONTIPREMIUMCONTACT\s+5\s+PINK\s+LINES\b/gi, 'ContiPremiumContact 5')
    .replace(/\bCCRX\s+CROSSCONTACT\s+RX\b/gi, 'CrossContact RX')
    .replace(/\bCROSSCONT\s+LX\s+SP\s+SIL\b/gi, 'CrossContact LX Sport')
    .replace(/\bCONTINENTAL\s+CROSSCONT\s+LX\s+SP\s+SIL\b/gi, 'CrossContact LX Sport')
    .replace(/\bFR\s+CONTICROSSCONTACT\s+LX\s+2\b/gi, 'CrossContact LX 2')
    .replace(/\bCONTICROSSCONTACT\s+LX\s+2\b/gi, 'CrossContact LX 2')
    .replace(/\bCROSSCONT\s+ATR\s+LRE\s+FR\b/gi, 'CrossContact ATR')
    .replace(/\bCROSSCONT\s+ATR\s+FR\b/gi, 'CrossContact ATR')
    .replace(/\bFR\s+CCATR\s+CROSSCONTACT\s+ATR\b/gi, 'CrossContact ATR')
    .replace(/\bFR\s+CCATR\b/gi, 'CrossContact ATR')
    .replace(/\bCCATR\b/gi, 'CrossContact ATR')
    .replace(/\bCCAT\s+CONTICROSSCONTAC(?:T)?\s+AT(?:\s+8)?\b/gi, 'ContiCrossContact AT')
    .replace(/\bCON255\s+(?:CONTINENTAL\s+)?\d+S\s+FR\s+CCAT\s+CROSSCONTACT\b/gi, 'ContiCrossContact AT')
    .replace(/\bCON255\s+FR\s+CCAT\s+CROSSCONTACT\b/gi, 'ContiCrossContact AT')
    .replace(/\bCCART#?\s+LRE\s+FR\b/gi, 'CrossContact ATR')
    .replace(/\bCROSSCONT\s+AT\s+FR\b/gi, 'ContiCrossContact AT')
    .replace(/\bFR\s+\*\s+ECOCONTACT\s+6Q\b/gi, 'EcoContact 6Q')
    .replace(/\bECOCONTACT6Q\s+SIL\b/gi, 'EcoContact 6Q')
    .replace(/\bEC6\s+ECOCONTACT\s+6\b/gi, 'EcoContact 6Q')
    .replace(/\bFR\s+SC5\s+CONTISPORTCONTACT\s+5\b/gi, 'ContiSportContact 5')
    .replace(/\bSC5\s+FR\s+SSR\b/gi, 'ContiSportContact 5')
    .replace(/\bFR\s+SC5\s+SSR\b/gi, 'ContiSportContact 5')
    .replace(/\bSC5\s+SUV\s+CONTI\s+SPORTCONTACT5\b/gi, 'ContiSportContact 5')
    .replace(/\bSPORTCONTACT\s+5\s+SUV\b/gi, 'ContiSportContact 5')
    .replace(/\bCONTISPORTCONTACT5P\b/gi, 'ContiSportContact 5 P')
    .replace(/\bFR\s+SC5P\b/gi, 'ContiSportContact 5 P')
    .replace(/\bFR\s+PC6\s+PREMIUMCONTACT\s+6\b/gi, 'PremiumContact 6')
    .replace(/\bFR\s+PREMIUMCONTACT\s+6\b/gi, 'PremiumContact 6')
    .replace(/\bCONTI\s+FR\s+PC7\s+PREMIUMCONTACT\s+7\b/gi, 'PremiumContact 7')
    .replace(/\b(?:CONTI\s+)?FR\s+PREMIUMCONTACT\s+7\s+PREMIUMCONTACT\s+7\b/gi, 'PremiumContact 7')
    .replace(/\bPREMIUMCONTACT\s+6\s+PREMIUMCONTACT\s+6\b/gi, 'PremiumContact 6')
    .replace(/\bXLFRSC5P\s+CONTISPORTCONTACT\s+5\s+P\b/gi, 'ContiSportContact 5 P')
    .replace(/\bFRSC5\s+SSR\s+CONTISPORTCONT\s+5\b/gi, 'ContiSportContact 5')
    .replace(/\bCONTISPORTCONTACT\s+5\s+SSR\b/gi, 'ContiSportContact 5')
    .replace(/\b(?:\d+YR\d+\s+)?CONTISPORTCONTACT\s+5\s+P\b/gi, 'ContiSportContact 5 P')
    .replace(/\bCONTI\s+CONTISPORTCONTACT\s+5\b/gi, 'ContiSportContact 5')
    .replace(/^SC5$/gi, 'ContiSportContact 5')
    .replace(/^SPORT\s+CONTACT$/gi, 'ContiSportContact 5')
    .replace(/^SC5P\s+SPORT\s+CONTACT$/gi, 'ContiSportContact 5 P')
    .replace(/\bEC5\s+CONTIECOCONTACT\s+5\b/gi, 'ContiEcoContact 5')
    .replace(/\bVANC10\b/gi, 'ContiVanContact 100')
    .replace(/\bVANCONT(?:\s+10)?\b/gi, 'ContiVanContact 100')
    .replace(/\bWORLDCONT\s+4X4\b/gi, 'WorldContact 4x4')
    .replace(/\bALENZA\s+X\b/gi, 'Alenza 001')
    .replace(/\bFR\s+CONTICROSSCONTACT\s+LX\s+2\b/gi, 'CrossContact LX 2')
    .replace(/\bCROSSCONT\s+UHP\s+FR\b/gi, 'CrossContact UHP')
    .replace(/\bGRAB\s+AT3\s+TIRE\s+GRABBER\b/gi, 'Grabber AT3')
    .replace(/\bGRABBER\s+AT3\s+FR\b/gi, 'Grabber AT3')
    .replace(/\bVANC100\s+CONTIVANCONTACT\b/gi, 'ContiVanContact 100')
    .replace(/\bST901\s+M\b/gi, 'ST901')
    .replace(/\bST939\s+S\b/gi, 'ST939')
    .replace(/\bST969\s+D\b/gi, 'ST969')
    .replace(/\bST916\s+T\b/gi, 'ST916')
    .replace(/\bD684\s+II\b/gi, 'Dueler HT 684 II')
    .replace(/\bDUELER\s+A\s*T\s+002\b/gi, 'Dueler AT 002')
    .replace(/\bD693\s+II\s+T9D\b/gi, 'Dueler AT D693 II')
    .replace(/\bD697\b/gi, 'Dueler AT D697')
    .replace(/\bS001\s+EXT\b/gi, 'Potenza S001')
    .replace(/\bS\s+VERD\b/gi, 'Scorpion Verde')
    .replace(/\bSZROAS(?:\s+LR)?(?:\s+NCS)?\b/gi, 'Scorpion Zero All Season')
    .replace(/\bP\s+ZERO\s+VOL\b/gi, 'P Zero')
    .replace(/\bCLX\s*10\b/gi, 'CLX10 Rangeblazer AT')
    .replace(/\bGRT800\s+S\b/gi, 'GRT800')
    .replace(/\bGRT880S?\s+D\b/gi, 'GRT880')
    .replace(/\bGRT901(?:\s+\d+PRPR)?\s+M\b/gi, 'GRT901')
    .replace(/\bGRT916(?:\s+\d+PRPR)?\s+T\b/gi, 'GRT916')
    .replace(/\bGRT932(?:\s+\d+PRPR)?\s+T\b/gi, 'GRT932')
    .replace(/\bT+F\s+FM18\s+TUBE\s*\+?\s*FLAP\b/gi, 'FM18')
    .replace(/\bFM188\s+M\b/gi, 'FM188')
    .replace(/\bFM330\s+MS\b/gi, 'FM330')
    .replace(/\bFM350\s+S\b/gi, 'FM350')
    .replace(/\bHS101\s+S\b/gi, 'HS101')
    .replace(/\bHS102\s+D\b/gi, 'HS102')
    .replace(/\bHS268\s+M\b/gi, 'HS268')
    .replace(/\bHS166\s+S\b/gi, 'HS166')
    .replace(/\bS801\b/gi, 'ComfortMax S801')
    .replace(/\bRF08\b/gi, 'Transporter RF08')
    .replace(/\bX\s+PRIVILO\s*H\s*T\b/gi, 'X Privilo H/T')
    .replace(/\bX\s+PRIVILOH\b/gi, 'X Privilo H/T')
    .replace(/\bX\s+PRIVILO\s*AT01\b/gi, 'X Privilo AT01')
    .replace(/\bX\s+PRIVILOAT01\b/gi, 'X Privilo AT01')
    .replace(/\bX\s+PRIVILO\s*M\s*T\b/gi, 'X Privilo M/T')
    .replace(/\bRF09\b/gi, 'Transporter RF09')
    .replace(/\bTRANSPORTER\s+TRANSPORTER\s+RF09\b/gi, 'Transporter RF09')
    .replace(/\bECO\s+COMF\s+33\b/gi, 'ECO Comfort 33')
    .replace(/\bECO\s+COMF\s+(52|53|55)\b/gi, 'ECO Comfort $1')
    .replace(/\bECO\s+59\b/gi, 'ECO Sport 59')
    .replace(/\bECO\s+SPRT\s+(58|59)\b/gi, 'ECO Sport $1')
    .replace(/\bKMAX\s+S\s+END\s+\d+[A-Z]\d+[A-Z]\b/gi, 'KMAX S')
    .replace(/\bKSM\s+ARMSTEEL\s+KELLY\b/gi, 'Kelly Armorsteel KMS')
    .replace(/\bR(?:14|15)LT\s+TM257\b/gi, 'TM257')
    .replace(/\bTM257\b/gi, 'TM257')
    .replace(/\bTM258\b/gi, 'TM258')
    .replace(/\b(?:PR)?(\d{3})\s+(WD20\d{2})\b/gi, '$2')
    .replace(/\bWD2020\s+D\b/gi, 'WD2020')
    .replace(/\bWT3000\s+T\b/gi, 'WT3000')
    .replace(/\bWT3020\s+T\b/gi, 'WT3020')
    .replace(/\bTRANS\s+MASTER\s+GTM380\s+T\b/gi, 'TRANS MASTER GTM380')
    .replace(/\bWINDFORCE\d+\s+(WA1060)\b/gi, '$1')
    .replace(/\bWINDFORCE\d+\s+(WD2068)\b/gi, '$1')
    .replace(/\bPR143\s+(WT3000)\b/gi, '$1')
    .replace(/\bSP431W\s+\d+\b/gi, 'SP431W')
    .replace(/\bSAVA\s+CARGO\s+4\b/gi, 'SAVA CARGO MS')
    .replace(/\bEAGLE\s+F1\s+ASYMMETRIC\s+3\s+SUV\s+XLROF+F?\b/gi, 'Eagle F1 Asymmetric 3 SUV')
    .replace(/\bDIMAX\s+R8\+?\s+LT\b/gi, 'DIMAX R8')
    .replace(/\bWILDTRAXX\s+MT\s+MI\b/gi, 'WILDTRAXX MT')
    .replace(/\s+/g, ' ')
    .trim();

  if (/^KAPSEN$/i.test(brand)) {
    cleaned = cleaned
      .replace(/\bRS01\b/gi, 'DurableMax RS01')
      .replace(/^.*\bH202\b.*$/gi, 'H202');
  }

  if (/^CEAT$/i.test(brand)) {
    cleaned = cleaned
      .replace(/^(?:\d+\s+)+MILAZE\b/gi, 'Milaze')
      .replace(/^(?:\d+\s+)+SECURA\s+ZOOM\+?\b/gi, 'Secura Zoom+')
      .replace(/^(?:\d+\s+)+ZOOM\s+PLUS\s+TT\b/gi, 'Secura Zoom+')
      .replace(/\bSECURA\s+ZOOM\+?\s+TT\b/gi, 'Secura Zoom+')
      .replace(/^(?:\d+\s+)+SECURA\s+F(?:\s+85)?\b/gi, 'Secura F85')
      .replace(/\+{2,}/g, '+');
  }

  if (/^BRIDGESTONE$/i.test(brand)) {
    cleaned = cleaned
      .replace(/^DUELER\s+AT$/i, 'Dueler AT 002')
      .replace(/^S001$/i, 'Potenza S001');
  }

  if (/^GOODYEAR$/i.test(brand)) {
    cleaned = cleaned
      .replace(/^WRL\s+AT$/i, 'Wrangler AT/S')
      .replace(/^WRANGLER\s+AT$/i, 'Wrangler AT/S')
      .replace(/^EAGLE\s+F1\s+SUPERSPORT(?:\s+(?:AO|R0)?XLFP(?:PC)?|(?:\s+R)?\s+XLFP(?:PC)?)?$/i, 'Eagle F1 SuperSport')
      .replace(/^EAGLE\s+F1\s+SUPERSP\s+R\s+XLFPPC$/i, 'Eagle F1 SuperSport')
      .replace(/^EFFICIENTGRIP\s+CARGO\s+2$/i, 'EfficientGrip Cargo 2')
      .replace(/^WRANGLER\s+AT\s+ADVENTURE\s+LR$/i, 'Wrangler AT Adventure');
  }

  if (/^DUNLOP$/i.test(brand)) {
    cleaned = cleaned
      .replace(/^AT20$/i, 'Grandtrek AT20')
      .replace(/^AT3GM?$/i, 'Grandtrek AT3G')
      .replace(/^AT3G"?\s+WLT$/i, 'Grandtrek AT3G')
      .replace(/^TRAKGRIP$/i, 'SP TrakGrip')
      .replace(/^AT22$/i, 'Grandtrek AT22')
      .replace(/^MAXX050\+?\s+ROF$/i, 'MAXX050+')
      .replace(/^\d+VR\d+\s+FM800\s+\d+$/i, 'FM800');
  }

  if (/^GENERAL$/i.test(brand)) {
    cleaned = cleaned
      .replace(/^SUP\s+AG$/i, 'Super All Grip')
      .replace(/^VANC100$/i, 'ContiVanContact 100')
      .replace(/^CON\s+CONTINENTAL\s+CCLXSP$/i, 'CrossContact LX Sport');
  }

  if (/^PIRELLI$/i.test(brand)) {
    cleaned = cleaned
      .replace(/^ZERO$/i, 'P Zero');
  }

  cleaned = cleaned
    .replace(/^\(?\d{2,3}[A-Z]\)?\s+(?:XL\s+)?(?:FR\s+)?(?:TL\s+)?/gi, ' ')
    .replace(/\b(?:XL|FR|TL|T\/L|STD|FP|RFT|ROF|MI|RWL|OWL)\b/gi, ' ')
    .replace(/\b\d{2,3}[A-Z](?:XL)?\b/gi, ' ')
    .replace(/\b\d{2,3}\/\d{2,3}[A-Z]\b/gi, ' ')
    .replace(/\b\d+\s*PR\b/gi, ' ')
    .replace(/\s+-\s*E\b/gi, ' ')
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

const parseSimpleSupplierCsv = (
  rawCsv: string,
  idPrefix: string,
  supplierName: string,
  options: { normalizePattern?: boolean } = {}
): InventoryItem[] => {
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

    const { brand, pattern: rawPattern } = splitBrandPattern(brandPattern, supplierName);
    const pattern = options.normalizePattern ? normalizeExclusiveTyrePattern(brand, rawPattern) : rawPattern;
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

    const sellingPriceIncVat = entry.price * 1.15;
    const roundedSellingPrice = Math.round((sellingPriceIncVat / 25) + 1e-9) * 25;

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
      stockByLocation: entry.branchStock,
      costPrice: entry.price,
      sellingPrice: roundedSellingPrice,
      lastUpdated: today
    };
  });
};

// --- ATT PARSER ---
export const parseAttData = (rawCsv: string): InventoryItem[] => {
  return parseSimpleSupplierCsv(rawCsv, 'att', 'ATT');
};

// --- BRIDGESTONE / FIRESTONE PARSER ---
export const parseBridgestoneData = (rawCsv: string): InventoryItem[] => {
  const lines = rawCsv.split('\n');
  const today = new Date().toISOString().split('T')[0];

  return lines.flatMap((line, index): InventoryItem[] => {
    const trimmed = line.trim();
    if (!trimmed) return [];

    const cols = parseCSVLine(trimmed);
    const brand = cols[0]?.trim();
    const requestedPattern = cols[1]?.replace(/\s+/g, ' ').trim();
    const portalPattern = cols[2]?.replace(/\s+/g, ' ').trim();
    const description = cols[3]?.replace(/\s+/g, ' ').trim();
    const sku = cols[5]?.trim();

    if (index === 0 && brand?.toUpperCase() === 'BRAND') return [];
    if (!brand || !description || !sku) return [];

    const normalizedDescription = description.replace(/^HL(?=\d)/i, '');
    const parsed = parseSupplierTyreFields({
      description: normalizedDescription,
      explicitSize: cols[4]?.trim(),
      explicitBrand: brand,
      explicitPattern: portalPattern || requestedPattern
    });
    if (!parsed.size || !parsed.pattern) return [];

    const stockType = cols[6]?.trim();
    const stockLocation = cols[7]?.trim();
    const quantity = Math.max(0, parseStockUnits(cols[8]));
    const costPriceExVat = parseCurrencyString(cols[9]);
    const sellingPrice = parseCurrencyString(cols[11]) || parseCurrencyString(cols[10]);

    return [{
      id: `bridgestone-${sku}`,
      type: ProductType.TYRE,
      ...supplierTyreImageMetadata('BRIDGESTONE', brand, parsed.pattern, sku),
      brand,
      pattern: parsed.pattern,
      size: parsed.size,
      loadSpeedIndex: buildTyreIndexDisplay(parsed.rating, parsed.index),
      tyreRating: parsed.rating,
      tyreIndex: parsed.index,
      tyreSpecs: parsed.specs,
      location: [stockLocation || 'Supplier', stockType].filter(Boolean).join(' | '),
      quantity,
      costPrice: costPriceExVat,
      sellingPrice,
      lastUpdated: today
    }];
  });
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
  priceBySku: Record<string, number> = {}
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
      stockByLocation: entry.branchStock,
      costPrice: price,
      sellingPrice: price,
      lastUpdated: today
    };
  });
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
    const spec = parseAlineWheelDescription(description);

    items.push({
      id: `aline-${idCounter++}`,
      type: ProductType.WHEEL,
      supplierName: 'ALINE',
      supplierStockCode: stockCode,
      imageDesignKey: spec.designKey,
      imageFinishKey: spec.finishKey,
      code: stockCode,
      size: spec.size || 'Accessory',
      pcd: spec.pcd,
      offset: spec.offset,
      centerBore: spec.centerBore,
      colour: [brand, description, category, catalogueNumber, recommendedRetail ? `RR ${formatCurrency(recommendedRetail)}` : ''].filter(Boolean).join(' | '),
      setQuantity: 4,
      location: `JHB: ${qtyJhb} | CPT: ${qtyCpt} | DBN: ${qtyDbn}`,
      stockByLocation: { JHB: qtyJhb, CPT: qtyCpt, DBN: qtyDbn },
      quantity: qtyJhb + qtyCpt + qtyDbn,
      costPrice: priceIncVat,
      sellingPrice: recommendedRetail || priceIncVat,
      lastUpdated: today
    });
  });

  return items;
};

// --- APEX PARSER ---
const parseStructuredSupplierRefreshData = (
  rawCsv: string,
  idPrefix: string,
  supplierName: string
): InventoryItem[] | null => {
  const lines = rawCsv.split('\n').filter((line) => line.trim());
  if (!lines.length) return [];

  const headers = parseCSVLine(lines[0]).map((header) => header.trim());
  const normalizedHeaders = headers.map((header) => header.toLowerCase().replace(/[^a-z0-9]+/g, ''));
  const column = (name: string) => normalizedHeaders.indexOf(name.toLowerCase().replace(/[^a-z0-9]+/g, ''));
  if (column('Supplier SKU') < 0 || column('Cost Price') < 0 || column('Selling Price') < 0) return null;

  const locationColumns = headers.flatMap((header, index) => {
    const match = header.match(/^(.+?)\s+Stock Units$/i);
    return match && !/^total$/i.test(match[1].trim())
      ? [{ index, location: match[1].trim() }]
      : [];
  });
  const today = new Date().toISOString().split('T')[0];

  return lines.slice(1).flatMap((line, index) => {
    const cols = parseCSVLine(line);
    const get = (name: string) => {
      const position = column(name);
      return position >= 0 ? cols[position]?.trim() || '' : '';
    };
    const sku = get('Supplier SKU');
    const productName = get('Product Name');
    const parsedTyre = parseSupplierTyreFields({
      description: productName,
      explicitSize: get('TYRE_SIZE'),
      explicitBrand: get('TYRE_BRAND'),
      explicitPattern: get('TYRE_PATTERN'),
      explicitRating: get('TYRE_RATING'),
      explicitIndex: get('TYRE_INDEX'),
      explicitSpecs: get('TYRE_SPECS'),
      inferBrandFromDescription: true
    });
    const skuSizeMatch = sku.match(/(\d{3})(\d{2})(\d{2})/);
    const size = parsedTyre.size || (skuSizeMatch ? `${skuSizeMatch[1]}/${skuSizeMatch[2]}R${skuSizeMatch[3]}` : '');
    const brand = parsedTyre.brand;
    const pattern = parsedTyre.pattern;
    if (!sku || !size || !brand || !pattern) return [];

    const tyreRating = parsedTyre.rating;
    const tyreIndex = parsedTyre.index;
    const tyreSpecs = parsedTyre.specs;
    const stockByLocation = Object.fromEntries(locationColumns.map(({ index: stockIndex, location }) => (
      [location, parseStockUnits(cols[stockIndex])]
    )));
    const locationTotal = Object.values(stockByLocation).reduce((total, quantity) => total + quantity, 0);
    const declaredTotal = parseStockUnits(get('Total Stock Units'));
    const quantity = Math.max(locationTotal, declaredTotal);

    return [{
      id: `${idPrefix}-${index + 1}`,
      type: ProductType.TYRE,
      ...supplierTyreImageMetadata(supplierName, brand, pattern, sku),
      brand,
      pattern,
      size,
      loadSpeedIndex: [tyreRating, tyreIndex].filter(Boolean).join(' '),
      tyreRating,
      tyreIndex,
      tyreSpecs,
      location: locationColumns.map(({ location }) => `${location}: ${stockByLocation[location] || 0}`).join(' | ') || supplierName,
      stockByLocation,
      quantity,
      costPrice: parseCurrencyString(get('Cost Price')),
      sellingPrice: parseCurrencyString(get('Selling Price')),
      lastUpdated: today
    } satisfies TyreProduct];
  });
};

export const parseApexData = (rawCsv: string): InventoryItem[] => {
  const refreshedItems = parseStructuredSupplierRefreshData(rawCsv, 'apex', 'APEX');
  if (refreshedItems) return refreshedItems;
  return parseSimpleSupplierCsv(rawCsv, 'apex', 'APEX', { normalizePattern: true });
};

const getAvailabilityQuantity = (availability: string, stockUnits: string): number => {
  const parsedUnits = parseStockUnits(stockUnits);
  if (parsedUnits > 0) return parsedUnits;
  return /available/i.test(availability) ? 1 : 0;
};

const extractExoticPattern = (productName: string, size: string, brand: string): string => (
  productName
    .replace(new RegExp(escapeRegExp(size), 'i'), ' ')
    .replace(new RegExp(`^\\s*${escapeRegExp(brand)}\\s+`, 'i'), ' ')
    .replace(/\b(?:motorcycle\s+)?tyre\b/gi, ' ')
    .replace(/\b(?:XL|TL|TT|RWL|OWL)\b/gi, ' ')
    .replace(/\b\d+\s*PR\b/gi, ' ')
    .replace(/\b\d{2,3}[A-Z](?:\/\d{2,3}[A-Z])?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim() || productName || 'Standard'
);

// --- EXOTIC PARSER ---
export const parseExoticData = (rawCsv: string): InventoryItem[] => {
  const refreshedItems = parseStructuredSupplierRefreshData(rawCsv, 'exotic', 'EXOTIC');
  if (refreshedItems) return refreshedItems;
  const groupedItems = new Map<string, {
    sku: string;
    category: string;
    brand: string;
    pattern: string;
    size: string;
    branchAvailability: Record<string, string>;
    branchStock: Record<string, number>;
    totalQuantity: number;
    sellingPrice: number;
  }>();
  const lines = rawCsv.split('\n');
  const today = new Date().toISOString().split('T')[0];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const cols = parseCSVLine(trimmed);
    const supplier = cols[0]?.trim();
    const brand = cols[1]?.trim();
    const productName = cols[2]?.replace(/\s+/g, ' ').trim();
    const category = cols[3]?.trim();
    const size = cols[4]?.trim();
    const stockLocation = cols[5]?.trim() || 'Supplier';
    const availability = cols[6]?.trim() || 'Unknown';
    const stockUnits = cols[7]?.trim() || '';
    const sellingPrice = parseCurrencyString(cols[8]);
    const sku = cols[9]?.trim();

    if (index === 0 && supplier?.toUpperCase() === 'SUPPLIER') return;
    if (/alloy\s+wheels/i.test(category || '')) return;
    if (!sku || !brand || !productName || !size || !/tyres?/i.test(category || productName)) return;

    const branchQuantity = getAvailabilityQuantity(availability, stockUnits);
    const pattern = extractExoticPattern(productName, size, brand);
    const existing = groupedItems.get(sku) ?? {
      sku,
      category: category || 'Tyres',
      brand,
      pattern,
      size,
      branchAvailability: {},
      branchStock: {},
      totalQuantity: 0,
      sellingPrice
    };

    existing.branchAvailability[stockLocation] = availability;
    existing.branchStock[stockLocation] = (existing.branchStock[stockLocation] || 0) + branchQuantity;
    existing.totalQuantity += branchQuantity;
    if (!existing.sellingPrice && sellingPrice) existing.sellingPrice = sellingPrice;
    groupedItems.set(sku, existing);
  });

  return Array.from(groupedItems.values()).map((entry, index) => {
    const preferredBranches = ['Cape Town', 'Johannesburg', 'Durban', 'Port Elizabeth'];
    const knownBranches = preferredBranches.filter((branch) => branch in entry.branchAvailability);
    const otherBranches = Object.keys(entry.branchAvailability).filter((branch) => !preferredBranches.includes(branch)).sort();
    const location = [...knownBranches, ...otherBranches]
      .map((branch) => `${branch}: ${entry.branchAvailability[branch]}`)
      .join(' | ');

    return {
      id: `exotic-${index + 1}`,
      type: ProductType.TYRE,
      ...supplierTyreImageMetadata('EXOTIC', entry.brand, entry.pattern, entry.sku),
      brand: entry.brand,
      pattern: entry.pattern,
      size: entry.size,
      loadSpeedIndex: [entry.sku, entry.category, 'Availability only'].filter(Boolean).join(' | '),
      location: location || 'EXOTIC',
      quantity: entry.totalQuantity,
      stockByLocation: entry.branchStock,
      costPrice: entry.sellingPrice,
      sellingPrice: entry.sellingPrice,
      lastUpdated: today
    };
  });
};

// --- ARC SUSPENSION PARSER ---
export const parseArcData = (rawCsv: string): InventoryItem[] => {
  const items: CoiloverProduct[] = [];
  const lines = rawCsv.split('\n');
  const today = new Date().toISOString().split('T')[0];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || index === 0) return;

    const cols = parseCSVLine(trimmed);
    const brand = cols[0]?.trim() || 'ARC';
    const series = cols[1]?.trim() || 'Suspension';
    const vehicleCompatibility = cols[2]?.trim() || 'Universal';
    const price = parseCurrencyString(cols[3]);
    const searchBlob = `${brand} ${series} ${vehicleCompatibility}`;

    if (/alloy\s+wheels?|mag\s+wheels?|\brims?\b/i.test(searchBlob)) return;
    if (!vehicleCompatibility || price <= 0) return;

    items.push({
      id: `arc-${index}-${normalizeString(`${brand}-${series}-${vehicleCompatibility}`)}`,
      type: ProductType.COILOVER,
      brand,
      series,
      vehicleCompatibility,
      quantity: 1,
      sellingPrice: price,
      costPrice: price,
      supplierName: 'ARC',
      supplierStockCode: normalizeString(`${brand}-${series}-${vehicleCompatibility}`).toUpperCase(),
      lastUpdated: today
    });
  });

  return items;
};

// --- TUBESTONE PARSER ---
export const parseTubestoneData = (rawCsv: string): InventoryItem[] => {
  const refreshedItems = parseStructuredSupplierRefreshData(rawCsv, 'tubestone', 'TUBESTONE');
  if (refreshedItems) return refreshedItems;
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
      stockByLocation: { BFN: bfnQty, CPT: cptQty, DBN: dbnQty, JHB: jhbQty, NWH: nwhQty },
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
  const refreshedItems = parseStructuredSupplierRefreshData(rawCsv, 'treads', 'TREADS UNLIMITED');
  if (refreshedItems) return refreshedItems;
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
      stockByLocation: { Regional: regionalQty, National: nationalQty },
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
    const sellingPriceIncVat = entry.price * 1.15;
    const roundedSellingPrice = Math.round(sellingPriceIncVat / 50) * 50;

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
      stockByLocation: entry.branchStock,
      costPrice: entry.price,
      sellingPrice: roundedSellingPrice,
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
    const sellingPriceIncVat = entry.price * 1.15;
    const roundedSellingPrice = Math.round(sellingPriceIncVat / 50) * 50;

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
      stockByLocation: entry.branchStock,
      costPrice: entry.price,
      sellingPrice: roundedSellingPrice,
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
      stockByLocation: { JHB: jhbQty, CPT: cptQty, DBN: dbnQty },
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
      brand,
      finish,
      size: normalizeWheelSize(rawSize),
      pcd,
      offset,
      centerBore,
      colour: [brand, finish, category, sku].filter(Boolean).join(' | '),
      setQuantity: 4,
      location: `JHB: ${jhbQty} | CPT: ${cptQty} | DBN: ${dbnQty}`,
      stockByLocation: { JHB: jhbQty, CPT: cptQty, DBN: dbnQty },
      quantity,
      costPrice: sellingPrice,
      sellingPrice,
      lastUpdated: today
    });
  });

  return items;
};
