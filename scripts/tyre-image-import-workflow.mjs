import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

export const BUCKET_NAME = 'supplier-stock-images';
export const DEFAULT_BATCH_SIZE = 25;
export const DEFAULT_MANIFEST_PATH = 'reports/tyre-image-import-batches.json';
export const DEFAULT_REPORT_PATH = 'reports/tyre-image-import-report.json';
export const DEFAULT_REVIEW_PATH = 'reports/tyre-image-import-review.html';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://moiybakshvuvppesbnpt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_CmagmxnGcxu9bGWdwWfwjQ_2y_ZXw9j';
const IMPORT_TOKEN = process.env.SUPPLIER_IMAGE_IMPORT_TOKEN;
const IMPORT_FUNCTION_SLUG = process.env.SUPPLIER_IMAGE_IMPORT_FUNCTION || 'import-supplier-stock-image';

const RAW_SUPPLIERS = [
  { supplier: 'SAILUN', file: 'supplier_data/sailunData.ts', parser: 'sailun' },
  { supplier: 'EXCLUSIVE TYRES', file: 'supplier_data/exclusiveTyresData.ts', parser: 'exclusive' },
  { supplier: 'TYREWAREHOUSE', file: 'supplier_data/tyreWarehouseData.ts', parser: 'warehouse' },
  { supplier: 'ATT', file: 'supplier_data/attData.ts', parser: 'simple' },
  { supplier: 'SAFETY GRIP', file: 'supplier_data/safetygripData.ts', parser: 'safetyGrip' },
  { supplier: 'STAMFORD', file: 'supplier_data/stamfordData.ts', parser: 'stamford' },
  { supplier: 'APEX', file: 'supplier_data/apexData.ts', parser: 'simple' },
  { supplier: 'TUBESTONE', file: 'supplier_data/tubestoneData.ts', parser: 'tubestone' },
  { supplier: 'TREAD ZONE', file: 'supplier_data/treadZoneData.ts', parser: 'branchRows' },
  { supplier: 'SUMITOMO/DUNLOP', file: 'supplier_data/sumitomoDunlopData.ts', parser: 'branchRows' },
  { supplier: 'TREADS UNLIMITED', file: 'supplier_data/treadsUnlimitedData.ts', parser: 'treads' },
  { supplier: 'TYRE LIFE', file: 'supplier_data/tyreLifeData.ts', parser: 'tyreLife' }
];

const STATUS_PRIORITY = new Set(['pending', 'failed']);
const execFileAsync = promisify(execFile);

export const normalizeToken = (value = '') => (
  String(value)
    .normalize('NFKD')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const slugify = (value = '') => normalizeToken(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const parseCsvLine = (line) => {
  const result = [];
  let current = '';
  let inQuote = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuote && line[index + 1] === '"') {
        current += '"';
        index += 1;
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

const parseStockUnits = (value = '') => {
  if (/\d+\s*\+/i.test(value)) return Number.parseInt(value.match(/\d+/)?.[0] ?? '0', 10);
  return Number.parseInt(String(value).match(/-?\d+/)?.[0] ?? '0', 10) || 0;
};

const splitBrandPattern = (brandPattern, fallbackBrand) => {
  const cleaned = String(brandPattern || '').replace(/\s+/g, ' ').trim();
  const dashParts = cleaned.split(/\s+-\s+/);
  if (dashParts.length > 1) {
    return {
      brand: dashParts[0].trim() || fallbackBrand,
      pattern: dashParts.slice(1).join(' - ').replace(/^TYRES\s+/i, '').trim() || 'Standard'
    };
  }

  const parts = cleaned.split(' ').filter(Boolean);
  return {
    brand: parts[0] || fallbackBrand,
    pattern: parts.slice(1).join(' ') || 'Standard'
  };
};

const normalizeExclusiveTyrePattern = (brand, pattern) => {
  const brandKey = String(brand || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const brandCodeNoise = {
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
  let cleaned = String(pattern || '')
    .replace(/\bIMP\b/gi, ' ')
    .replace(/\bTYRES?\b/gi, ' ')
    .replace(new RegExp(`^\\s*${brandKey}\\s+`, 'i'), ' ')
    .replace(new RegExp(`\\b${brandKey}\\b`, 'gi'), ' ')
    .replace(brandCodeNoise[String(brand || '').toUpperCase()] ?? /$a/, ' ')
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
    .replace(brandCodeNoise[String(brand || '').toUpperCase()] ?? /$a/, ' ')
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

  if (/^KAPSEN$/i.test(String(brand || ''))) {
    cleaned = cleaned
      .replace(/\bRS01\b/gi, 'DurableMax RS01')
      .replace(/^.*\bH202\b.*$/gi, 'H202');
  }

  if (/^CEAT$/i.test(String(brand || ''))) {
    cleaned = cleaned
      .replace(/^(?:\d+\s+)+MILAZE\b/gi, 'Milaze')
      .replace(/^(?:\d+\s+)+SECURA\s+ZOOM\+?\b/gi, 'Secura Zoom+')
      .replace(/^(?:\d+\s+)+ZOOM\s+PLUS\s+TT\b/gi, 'Secura Zoom+')
      .replace(/\bSECURA\s+ZOOM\+?\s+TT\b/gi, 'Secura Zoom+')
      .replace(/^(?:\d+\s+)+SECURA\s+F(?:\s+85)?\b/gi, 'Secura F85')
      .replace(/\+{2,}/g, '+');
  }

  if (/^BRIDGESTONE$/i.test(String(brand || ''))) {
    cleaned = cleaned
      .replace(/^DUELER\s+AT$/i, 'Dueler AT 002')
      .replace(/^S001$/i, 'Potenza S001');
  }

  if (/^GOODYEAR$/i.test(String(brand || ''))) {
    cleaned = cleaned
      .replace(/^WRL\s+AT$/i, 'Wrangler AT/S')
      .replace(/^WRANGLER\s+AT$/i, 'Wrangler AT/S')
      .replace(/^EAGLE\s+F1\s+SUPERSPORT(?:\s+(?:AO|R0)?XLFP(?:PC)?|(?:\s+R)?\s+XLFP(?:PC)?)?$/i, 'Eagle F1 SuperSport')
      .replace(/^EAGLE\s+F1\s+SUPERSP\s+R\s+XLFPPC$/i, 'Eagle F1 SuperSport')
      .replace(/^EFFICIENTGRIP\s+CARGO\s+2$/i, 'EfficientGrip Cargo 2')
      .replace(/^WRANGLER\s+AT\s+ADVENTURE\s+LR$/i, 'Wrangler AT Adventure');
  }

  if (/^DUNLOP$/i.test(String(brand || ''))) {
    cleaned = cleaned
      .replace(/^AT20$/i, 'Grandtrek AT20')
      .replace(/^AT3GM?$/i, 'Grandtrek AT3G')
      .replace(/^AT3G"?\s+WLT$/i, 'Grandtrek AT3G')
      .replace(/^TRAKGRIP$/i, 'SP TrakGrip')
      .replace(/^AT22$/i, 'Grandtrek AT22')
      .replace(/^MAXX050\+?\s+ROF$/i, 'MAXX050+')
      .replace(/^\d+VR\d+\s+FM800\s+\d+$/i, 'FM800');
  }

  if (/^GENERAL$/i.test(String(brand || ''))) {
    cleaned = cleaned
      .replace(/^SUP\s+AG$/i, 'Super All Grip')
      .replace(/^VANC100$/i, 'ContiVanContact 100')
      .replace(/^CON\s+CONTINENTAL\s+CCLXSP$/i, 'CrossContact LX Sport');
  }

  if (/^PIRELLI$/i.test(String(brand || ''))) {
    cleaned = cleaned
      .replace(/^ZERO$/i, 'P Zero');
  }

  return cleaned || String(pattern || '').replace(/\bIMP\b/gi, ' ').replace(/\s+/g, ' ').trim() || 'Standard';
};

const imageKeys = (brand, pattern) => ({
  designKey: normalizeToken(pattern || brand || 'TYRE'),
  finishKey: normalizeToken(brand)
});

const readRawExport = async (filePath) => {
  const source = await readFile(filePath, 'utf8');
  const equalsIndex = source.indexOf('=');
  const semicolonIndex = source.lastIndexOf(';');
  const literal = source.slice(equalsIndex + 1, semicolonIndex > equalsIndex ? semicolonIndex : undefined).trim();

  if (literal.startsWith('`')) return literal.slice(1, literal.lastIndexOf('`'));
  if (literal.startsWith('"') || literal.startsWith("'")) return JSON.parse(literal);
  throw new Error(`Could not read raw supplier export from ${filePath}`);
};

const addItem = (items, supplier, id, brand, pattern, quantity = 0, sku = '') => {
  if (!brand || !pattern) return;
  const keys = imageKeys(brand, pattern);
  items.push({
    id,
    supplier,
    supplierStockCode: sku || id,
    brand: brand.trim(),
    pattern: pattern.trim(),
    quantity,
    designKey: keys.designKey,
    finishKey: keys.finishKey
  });
};

export const parseSupplierTyreRows = (supplier, parser, raw) => {
  const items = [];
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let idCounter = 1;

  if (parser === 'sailun') {
    for (const line of lines) {
      if (!line.startsWith('322')) continue;
      const parts = line.split(/\s+/);
      if (parts.length < 9) continue;
      let liIndex = -1;
      for (let index = 5; index < parts.length - 3; index += 1) {
        if (/^\d{2,3}$/.test(parts[index]) && /^[A-Z]$/.test(parts[index + 1])) {
          liIndex = index;
          break;
        }
      }
      const pattern = liIndex > -1 ? parts.slice(5, liIndex).join(' ') : `${parts[5] || ''} ${parts[6] || ''}`.trim();
      addItem(items, supplier, parts[0], 'Sailun', pattern || 'Standard', 100, parts[0]);
    }
    return items;
  }

  for (const [index, line] of lines.entries()) {
    const cols = parseCsvLine(line);
    if (index === 0 && /^(SIZE|SKU|CODE|TYRE SIZE)/i.test(cols[0] || '')) continue;

    if (parser === 'simple') {
      const size = cols[0]?.trim();
      const brandPattern = cols[1]?.trim();
      if (!size || !brandPattern) continue;
      const { brand, pattern } = splitBrandPattern(brandPattern, supplier);
      addItem(items, supplier, `${slugify(supplier)}-${idCounter++}`, brand, pattern, parseStockUnits(cols[4]), `${slugify(supplier)}-${idCounter}`);
    }

    if (parser === 'exclusive') {
      const size = cols[0]?.trim();
      const brandPattern = cols[1]?.trim();
      if (!size || !brandPattern) continue;
      const { brand, pattern: rawPattern } = splitBrandPattern(brandPattern, supplier);
      const pattern = normalizeExclusiveTyrePattern(brand, rawPattern);
      addItem(items, supplier, `exclusive-${idCounter++}`, brand, pattern, parseStockUnits(cols[3]), `exclusive-${idCounter}`);
    }

    if (parser === 'safetyGrip') {
      const code = cols[0]?.trim();
      const description = cols[1]?.replace(/\s+/g, ' ').trim();
      if (!code || !description) continue;
      const [, ...brandPatternParts] = description.split(/\s+/).filter(Boolean);
      const { brand, pattern } = splitBrandPattern(brandPatternParts.join(' '), supplier);
      addItem(items, supplier, code, brand, pattern, parseStockUnits(cols[2]), code);
    }

    if (parser === 'warehouse') {
      const [sku, , brand, pattern] = cols;
      if (!sku || !brand || !pattern) continue;
      addItem(items, supplier, sku, brand, pattern, parseStockUnits(cols[7] || cols[6]), sku);
    }

    if (parser === 'stamford') {
      const [sku, brand, pattern] = cols;
      if (!sku || !brand || !pattern) continue;
      addItem(items, supplier, sku, brand, pattern, parseStockUnits(cols[7] || cols[6]), sku);
    }

    if (parser === 'tubestone') {
      const [size, sku, brand, description] = cols;
      if (!size || !sku || !brand || !description) continue;
      const pattern = description
        .replace(new RegExp(size.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
        .replace(new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
        .replace(/\b\d+\s*PR\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim() || sku;
      addItem(items, supplier, sku, brand, pattern, parseStockUnits(cols[11]), sku);
    }

    if (parser === 'treads') {
      const [size, sku, brand, description] = cols;
      if (!size || !sku || !brand || !description) continue;
      const pattern = description
        .replace(new RegExp(size.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
        .replace(new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
        .replace(/\s+/g, ' ')
        .trim() || sku;
      addItem(items, supplier, sku, brand, pattern, parseStockUnits(cols[6]), sku);
    }

    if (parser === 'branchRows') {
      const [sku, , brand, pattern] = cols;
      if (!sku || !brand || !pattern) continue;
      addItem(items, supplier, sku, brand, pattern, parseStockUnits(cols[7] || cols[6]), sku);
    }

    if (parser === 'tyreLife') {
      const [size, sku, brand, pattern] = cols;
      if (!size || !sku || !brand || !pattern) continue;
      addItem(items, supplier, sku, brand, pattern, parseStockUnits(cols[12]), sku);
    }
  }

  return items;
};

export const buildImportCandidates = (rows) => {
  const groups = new Map();

  for (const row of rows) {
    if (!row.designKey || !row.finishKey) continue;
    const key = `${row.finishKey}::${row.designKey}`;
    const candidate = groups.get(key) ?? {
      id: key,
      brand: row.brand,
      pattern: row.pattern,
      brandKey: row.finishKey,
      patternKey: row.designKey,
      affectedSkus: [],
      affectedSuppliers: [],
      supplierSkus: {},
      totalAvailableStock: 0,
      status: 'pending',
      checkedSourceUrls: [],
      searchQueries: buildSearchQueries(row.brand, row.pattern)
    };

    candidate.affectedSkus.push(row.supplierStockCode);
    if (!candidate.affectedSuppliers.includes(row.supplier)) candidate.affectedSuppliers.push(row.supplier);
    candidate.supplierSkus[row.supplier] = candidate.supplierSkus[row.supplier] ?? [];
    candidate.supplierSkus[row.supplier].push(row.supplierStockCode);
    candidate.totalAvailableStock += row.quantity || 0;
    groups.set(key, candidate);
  }

  return [...groups.values()].sort((first, second) => (
    second.affectedSkus.length - first.affectedSkus.length
    || second.totalAvailableStock - first.totalAvailableStock
    || first.brandKey.localeCompare(second.brandKey)
    || first.patternKey.localeCompare(second.patternKey)
  ));
};

export const selectBatch = (candidates, manifest, options = {}) => {
  const batchSize = Number.parseInt(options.batchSize ?? process.env.TYRE_IMAGE_BATCH_SIZE ?? DEFAULT_BATCH_SIZE, 10) || DEFAULT_BATCH_SIZE;
  const supplierFilter = normalizeToken(options.supplier);
  const brandFilter = normalizeToken(options.brand);
  const manifestById = new Map((manifest.candidates ?? []).map((candidate) => [candidate.id, candidate]));

  return candidates
    .map((candidate) => ({ ...candidate, ...(manifestById.get(candidate.id) ?? {}) }))
    .filter((candidate) => !supplierFilter || candidate.affectedSuppliers.some((supplier) => normalizeToken(supplier) === supplierFilter))
    .filter((candidate) => !brandFilter || candidate.brandKey === brandFilter)
    .filter((candidate) => options.force || STATUS_PRIORITY.has(candidate.status ?? 'pending'))
    .slice(0, batchSize);
};

export const buildSearchQueries = (brand, pattern) => {
  const phrase = `${brand} ${pattern} tyre product image`;
  return [
    `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(phrase + ' official')}`,
    `https://www.google.com/search?q=${encodeURIComponent(phrase + ' official tyre')}`,
    `https://www.google.com/search?q=${encodeURIComponent(phrase + ' tyre retailer')}`
  ];
};

export const readVerifiedSources = async (sourcePath) => {
  if (!sourcePath) return new Map();
  const parsed = JSON.parse(await readFile(sourcePath, 'utf8'));
  const entries = Array.isArray(parsed) ? parsed : parsed.sources ?? [];
  return new Map(entries.map((entry) => [`${normalizeToken(entry.brand)}::${normalizeToken(entry.pattern || entry.designKey)}`, entry]));
};

export const applyReviewedSource = (candidate, source) => {
  if (!source) return { ...candidate, status: 'pending', confidence: 'missing', reason: 'No reviewed source supplied for this batch candidate.' };
  const brandMatches = normalizeToken(source.brand) === candidate.brandKey;
  const patternMatches = normalizeToken(source.pattern || source.designKey) === candidate.patternKey;
  const hasImage = /^https?:\/\//i.test(source.imageUrl || '');
  const exact = source.confidence === 'exact' && brandMatches && patternMatches && hasImage;

  return {
    ...candidate,
    matchedImageUrl: source.imageUrl || '',
    sourcePageUrl: source.sourcePageUrl || source.pageUrl || '',
    checkedSourceUrls: Array.from(new Set([...(candidate.checkedSourceUrls ?? []), ...(source.checkedSourceUrls ?? []), source.sourcePageUrl || source.pageUrl].filter(Boolean))),
    confidence: exact ? 'exact' : source.confidence || 'ambiguous',
    status: exact ? 'exact' : (source.confidence === 'missing' ? 'missing' : 'ambiguous'),
    reason: exact ? 'Reviewed exact source matches brand, pattern and product image URL.' : 'Reviewed source did not pass exact brand/pattern/image checks.'
  };
};

export const loadManifest = async (manifestPath = DEFAULT_MANIFEST_PATH) => {
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    return { version: 1, batches: [], candidates: [] };
  }
};

const fetchExistingRows = async (candidate) => {
  const supplierList = candidate.affectedSuppliers.map(encodeURIComponent).join(',');
  const query = `supplier_stock_images?select=supplier,design_key,finish_key,public_image_url,storage_path,active&active=eq.true&design_key=eq.${encodeURIComponent(candidate.patternKey)}&finish_key=eq.${encodeURIComponent(candidate.brandKey)}&supplier=in.(${supplierList})`;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  });
  if (!response.ok) return [];
  return response.json();
};

const imageExtension = (mimeType, url) => {
  const fromMime = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif'
  }[mimeType];
  return fromMime || extname(new URL(url).pathname) || '.jpg';
};

const mimeTypeFromExtension = (url) => {
  const ext = extname(new URL(url).pathname).toLowerCase();
  return {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif'
  }[ext] || 'application/octet-stream';
};

const downloadImageWithCurl = async (url) => {
  const ext = extname(new URL(url).pathname) || '.img';
  const outputPath = join(tmpdir(), `gp-tyres-image-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
  try {
    const curlBinary = process.platform === 'win32' ? 'curl.exe' : 'curl';
    await execFileAsync(curlBinary, ['-L', '-sS', '--fail', '-A', 'GP Tyres image review importer/1.0', '-o', outputPath, url], { timeout: 60000 });
    const buffer = await readFile(outputPath);
    const mimeType = mimeTypeFromExtension(url);
    if (!mimeType.startsWith('image/')) throw new Error(`Source is not an image: ${mimeType}`);
    const hash = createHash('sha256').update(buffer).digest('hex');
    return { buffer, hash, mimeType, ext: imageExtension(mimeType, url) };
  } finally {
    await unlink(outputPath).catch(() => undefined);
  }
};

const downloadImage = async (url) => {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'GP Tyres image review importer/1.0'
      }
    });
    if (!response.ok) throw new Error(`Image download failed ${response.status}: ${url}`);
    const mimeType = response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream';
    if (!mimeType.startsWith('image/')) throw new Error(`Source is not an image: ${mimeType}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const hash = createHash('sha256').update(buffer).digest('hex');
    return { buffer, hash, mimeType, ext: imageExtension(mimeType, url) };
  } catch (error) {
    return downloadImageWithCurl(url).catch(() => {
      throw error;
    });
  }
};

const importImageForSuppliers = async (candidate, image) => {
  if (!IMPORT_TOKEN) throw new Error('SUPPLIER_IMAGE_IMPORT_TOKEN is required when --import is used.');
  const uploads = [];
  const storagePath = `tyres/${slugify(candidate.brandKey)}/${slugify(candidate.patternKey)}/${image.hash}${image.ext}`;
  const base64 = image.buffer.toString('base64');

  for (const supplier of candidate.affectedSuppliers) {
    const payload = {
      supplier,
      sourceFileId: `tyre-${candidate.brandKey}-${candidate.patternKey}-${image.hash}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
      fileName: basename(storagePath),
      storagePath,
      mimeType: image.mimeType,
      designKey: candidate.patternKey,
      finishKey: candidate.brandKey,
      tags: ['tyre', candidate.brandKey, candidate.patternKey, supplier].map(normalizeToken).filter(Boolean),
      base64
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
    if (!response.ok || body.ok === false) throw new Error(body.error || `Import failed for ${supplier}`);
    uploads.push({ supplier, publicImageUrl: body.publicImageUrl, storagePath });
  }

  return uploads;
};

const writeReports = async (manifest, batch, reportPath, reviewPath) => {
  await mkdir(join(reportPath, '..'), { recursive: true }).catch(() => undefined);
  await mkdir(join(reviewPath, '..'), { recursive: true }).catch(() => undefined);
  await writeFile(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), batch, manifest }, null, 2));

  const rows = batch.candidates.map((candidate) => `
    <tr class="${escapeHtml(candidate.status)}">
      <td><strong>${escapeHtml(candidate.brand)}</strong><br>${escapeHtml(candidate.pattern)}</td>
      <td>${candidate.matchedImageUrl ? `<img src="${escapeHtml(candidate.matchedImageUrl)}" alt="">` : '<span class="empty">No image</span>'}</td>
      <td>${escapeHtml(candidate.status)}<br><small>${escapeHtml(candidate.reason || '')}</small></td>
      <td>${escapeHtml(candidate.affectedSuppliers.join(', '))}<br><small>${escapeHtml(String(candidate.affectedSkus.length))} SKUs | ${escapeHtml(String(candidate.totalAvailableStock))} stock</small></td>
      <td>${(candidate.checkedSourceUrls?.length ? candidate.checkedSourceUrls : candidate.searchQueries).map((url) => `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`).join('<br>')}</td>
    </tr>`).join('');

  await writeFile(reviewPath, `<!doctype html>
<html><head><meta charset="utf-8"><title>Tyre image import review</title>
<style>
body{font-family:Arial,sans-serif;margin:24px;color:#1f2937}table{border-collapse:collapse;width:100%}td,th{border:1px solid #d1d5db;padding:10px;vertical-align:top}th{background:#111827;color:white;text-align:left}img{width:120px;max-height:120px;object-fit:contain}.exact,.uploaded,.skipped_existing{background:#ecfdf5}.ambiguous{background:#fff7ed}.missing,.failed{background:#fef2f2}.empty{color:#6b7280}a{color:#b91c1c;word-break:break-all}small{color:#6b7280}
</style></head><body>
<h1>Tyre image import review</h1>
<p>Batch ${escapeHtml(batch.id)} | ${escapeHtml(batch.startedAt)} | ${batch.candidates.length} candidates</p>
<table><thead><tr><th>Tyre</th><th>Preview</th><th>Status</th><th>Affected stock</th><th>Sources / search links</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`);
};

export const summarizeBatch = (candidates) => ({
  candidateCount: candidates.length,
  pendingCount: candidates.filter((candidate) => candidate.status === 'pending').length,
  exactCount: candidates.filter((candidate) => candidate.status === 'exact').length,
  ambiguousCount: candidates.filter((candidate) => candidate.status === 'ambiguous').length,
  missingCount: candidates.filter((candidate) => candidate.status === 'missing').length,
  failedCount: candidates.filter((candidate) => candidate.status === 'failed').length,
  skippedCount: candidates.filter((candidate) => candidate.status === 'skipped_existing').length,
  uploadedCount: candidates.filter((candidate) => candidate.status === 'uploaded').length
});

const parseArgs = (argv) => {
  const options = { import: false, dryRun: true, force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--import') {
      options.import = true;
      options.dryRun = false;
    } else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--resume') options.resume = true;
    else if (arg.startsWith('--batch-size')) options.batchSize = arg.includes('=') ? arg.split('=')[1] : argv[++index];
    else if (arg.startsWith('--supplier')) options.supplier = arg.includes('=') ? arg.split('=')[1] : argv[++index];
    else if (arg.startsWith('--brand')) options.brand = arg.includes('=') ? arg.split('=')[1] : argv[++index];
    else if (arg.startsWith('--sources')) options.sources = arg.includes('=') ? arg.split('=')[1] : argv[++index];
    else if (arg.startsWith('--manifest')) options.manifestPath = arg.includes('=') ? arg.split('=')[1] : argv[++index];
    else if (arg.startsWith('--report')) options.reportPath = arg.includes('=') ? arg.split('=')[1] : argv[++index];
    else if (arg.startsWith('--review')) options.reviewPath = arg.includes('=') ? arg.split('=')[1] : argv[++index];
  }
  return options;
};

export const runWorkflow = async (options = {}) => {
  const rows = [];
  for (const source of RAW_SUPPLIERS) {
    const raw = await readRawExport(source.file);
    rows.push(...parseSupplierTyreRows(source.supplier, source.parser, raw));
  }

  const allCandidates = buildImportCandidates(rows);
  const manifestPath = options.manifestPath || DEFAULT_MANIFEST_PATH;
  const manifest = await loadManifest(manifestPath);
  const sourceMap = await readVerifiedSources(options.sources);
  const batchCandidates = selectBatch(allCandidates, manifest, options);
  const batch = {
    id: `tyre-images-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    startedAt: new Date().toISOString(),
    candidates: []
  };

  for (const candidate of batchCandidates) {
    try {
      const existingRows = await fetchExistingRows(candidate);
      const existingSuppliers = new Set(existingRows.map((row) => row.supplier));
      if (!options.force && candidate.affectedSuppliers.every((supplier) => existingSuppliers.has(supplier))) {
        batch.candidates.push({
          ...candidate,
          status: 'skipped_existing',
          confidence: 'exact',
          matchedImageUrl: existingRows[0]?.public_image_url,
          reason: 'All affected suppliers already have an active Supabase image row.'
        });
        continue;
      }

      let reviewed = applyReviewedSource(candidate, sourceMap.get(candidate.id));
      if (reviewed.status === 'exact' && options.import) {
        const image = await downloadImage(reviewed.matchedImageUrl);
        reviewed.uploads = await importImageForSuppliers(reviewed, image);
        reviewed.imageHash = image.hash;
        reviewed.status = 'uploaded';
      }
      batch.candidates.push(reviewed);
    } catch (error) {
      batch.candidates.push({
        ...candidate,
        status: 'failed',
        confidence: 'missing',
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  batch.completedAt = new Date().toISOString();
  Object.assign(batch, summarizeBatch(batch.candidates));

  const candidateMap = new Map((manifest.candidates ?? []).map((candidate) => [candidate.id, candidate]));
  for (const candidate of batch.candidates) candidateMap.set(candidate.id, candidate);
  manifest.candidates = [...candidateMap.values()].sort((first, second) => first.id.localeCompare(second.id));
  manifest.batches = [...(manifest.batches ?? []), {
    id: batch.id,
    startedAt: batch.startedAt,
    completedAt: batch.completedAt,
    ...summarizeBatch(batch.candidates)
  }];

  await mkdir(join(manifestPath, '..'), { recursive: true }).catch(() => undefined);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  await writeReports(manifest, batch, options.reportPath || DEFAULT_REPORT_PATH, options.reviewPath || DEFAULT_REVIEW_PATH);
  return { rows, allCandidates, batch, manifest };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runWorkflow(parseArgs(process.argv.slice(2)))
    .then(({ allCandidates, batch }) => {
      console.log(`Tyre image batch complete: ${batch.id}`);
      console.log(`Unique brand/pattern candidates: ${allCandidates.length}`);
      console.log(JSON.stringify(summarizeBatch(batch.candidates), null, 2));
      console.log(`Reports written to the configured JSON and HTML review paths.`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
