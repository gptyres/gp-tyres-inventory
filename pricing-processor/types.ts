export type ProcessingMode = 'standard' | 'staggered';

export type IdentificationSource =
  | 'deterministic'
  | 'catalogue'
  | 'gemini-nano'
  | 'search-evidence'
  | 'unresolved';

export type ProcessingIssueSeverity = 'warning' | 'error';

export interface PricingRules {
  roundTo50: boolean;
  percentageMarkup: 0 | 15 | 20 | 25 | 30;
  fixedMarkup: number;
  showCategory: boolean;
  showRating: boolean;
  showOemSpec: boolean;
  showStock: boolean;
  showLeadTime: boolean;
}

export interface TyreRecord {
  id: string;
  rawText: string;
  layout: 'card' | 'table' | 'concatenated' | 'mixed';
  originalDescription: string | null;
  size: string | null;
  brand: string | null;
  pattern: string | null;
  category: string | null;
  rating: string | null;
  oemSpec: string | null;
  supplier: string | null;
  stock: string | null;
  leadTime: string | null;
  basePrice: number | null;
  priceFrom: number | null;
  priceTo: number | null;
  selectedPrice: number | null;
  calculatedPrice: number | null;
  vatIncluded: boolean | null;
  priceIsFinalSellingPrice: boolean;
  confidence: number;
  identificationSource: IdentificationSource;
  issues: string[];
}

export interface ProcessingIssue {
  recordId: string;
  message: string;
  severity: ProcessingIssueSeverity;
}

export interface ProcessingResult {
  records: TyreRecord[];
  validRecords: TyreRecord[];
  reviewRecords: TyreRecord[];
  errors: ProcessingIssue[];
  standardOutput: string;
  staggeredOutput: string | null;
}

export interface PricingProcessorInput {
  rawData: string;
  rules: PricingRules;
  mode: ProcessingMode;
  frontSize?: string;
  rearSize?: string;
}

export interface PricingSegment {
  id: string;
  text: string;
  layout: TyreRecord['layout'];
}

export interface PriceCandidate {
  raw: string;
  value: number;
  index: number;
  endIndex: number;
  label: string | null;
  isVatAmount: boolean;
}

export interface PriceExtraction {
  basePrice: number | null;
  priceFrom: number | null;
  priceTo: number | null;
  selectedPrice: number | null;
  vatIncluded: boolean | null;
  priceIsFinalSellingPrice: boolean;
  candidates: PriceCandidate[];
  issues: string[];
}

export interface IdentificationInput {
  description: string;
  rawText: string;
  size: string | null;
}

export interface IdentificationResult {
  brand: string | null;
  pattern: string | null;
  category: string | null;
  confidence: number;
  source: IdentificationSource;
}

export interface TyreIdentificationProvider {
  identify(input: IdentificationInput): Promise<IdentificationResult | null>;
}

export interface PricingProcessorSessionState {
  rawData: string;
  rules: PricingRules;
  mode: ProcessingMode;
  frontSize: string;
  rearSize: string;
  selectedPanel: 'standard' | 'staggered' | 'review';
  result: ProcessingResult | null;
}

export interface PricingPOSQuoteLine {
  sourceRecordId: string;
  title: string;
  description: string;
  quantity: number;
  unitPrice: number;
}
