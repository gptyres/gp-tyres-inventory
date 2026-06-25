import { calculateSellingPrice } from './calculate-price';
import { deduplicateRecords } from './deduplicate';
import { extractCategory, extractLeadTime, extractOemSpec, extractRating, extractStock, extractSupplier } from './extract-metadata';
import { extractPriceData } from './extract-price';
import { extractProductDescription } from './extract-product';
import { extractTyreSize, normalizeTyreSize } from './extract-size';
import { formatStandardOutput } from './format-standard';
import { formatStaggeredOutput } from './format-staggered';
import { identifyTyre } from './identify-tyre';
import { segmentRecords } from './segment';
import { PricingProcessorInput, ProcessingIssue, ProcessingResult, TyreRecord } from './types';

const createRecordIssue = (recordId: string, message: string): ProcessingIssue => ({
  recordId,
  message,
  severity: 'error'
});

const buildRecord = (segment: ReturnType<typeof segmentRecords>[number], rules: PricingProcessorInput['rules']): TyreRecord => {
  const size = extractTyreSize(segment.text);
  const priceData = extractPriceData(segment.text, segment.layout === 'concatenated');
  const originalDescription = extractProductDescription(segment.text, size);
  const identification = identifyTyre({
    description: originalDescription,
    rawText: segment.text,
    size
  });
  const category = identification.category ?? extractCategory(segment.text);

  const record: TyreRecord = {
    id: segment.id,
    rawText: segment.text,
    layout: segment.layout,
    originalDescription,
    size,
    brand: identification.brand,
    pattern: identification.pattern,
    category,
    rating: extractRating(segment.text),
    oemSpec: extractOemSpec(segment.text),
    supplier: extractSupplier(segment.text),
    stock: extractStock(segment.text),
    leadTime: extractLeadTime(segment.text),
    basePrice: priceData.basePrice,
    priceFrom: priceData.priceFrom,
    priceTo: priceData.priceTo,
    selectedPrice: priceData.selectedPrice,
    calculatedPrice: null,
    vatIncluded: priceData.vatIncluded,
    priceIsFinalSellingPrice: priceData.priceIsFinalSellingPrice,
    confidence: identification.confidence,
    identificationSource: identification.source,
    issues: [...priceData.issues]
  };

  record.calculatedPrice = calculateSellingPrice(record, rules);

  if (!record.size) record.issues.push('Tyre size could not be identified.');
  if (!record.selectedPrice) record.issues.push('No valid supplier price was detected.');
  if (!record.brand) record.issues.push('Brand could not be identified confidently.');
  if (!record.pattern) record.issues.push('Pattern could not be identified confidently.');
  if (record.calculatedPrice === null) record.issues.push('Customer price could not be calculated.');

  return record;
};

const isValidRecord = (record: TyreRecord): boolean => (
  Boolean(record.size && record.brand && record.pattern && record.selectedPrice && record.calculatedPrice)
);

const validateStaggeredSizes = (frontSize: string | undefined, rearSize: string | undefined): ProcessingIssue[] => {
  const issues: ProcessingIssue[] = [];
  const normalizedFront = normalizeTyreSize(frontSize ?? '');
  const normalizedRear = normalizeTyreSize(rearSize ?? '');

  if (!normalizedFront) issues.push(createRecordIssue('staggered-front-size', 'Enter a valid front tyre size for staggered mode.'));
  if (!normalizedRear) issues.push(createRecordIssue('staggered-rear-size', 'Enter a valid rear tyre size for staggered mode.'));
  if (normalizedFront && normalizedRear && normalizedFront === normalizedRear) {
    issues.push(createRecordIssue('staggered-size-match', 'Front and rear sizes must be different for staggered mode.'));
  }

  return issues;
};

export const processPricing = (input: PricingProcessorInput): ProcessingResult => {
  const segments = segmentRecords(input.rawData);
  const records = segments.map((segment) => buildRecord(segment, input.rules));
  const validRecords = records.filter(isValidRecord);
  const reviewRecords = records.filter((record) => !isValidRecord(record));
  const standardRecords = deduplicateRecords(validRecords);
  const errors: ProcessingIssue[] = records.flatMap((record) => (
    record.issues.map((message) => ({
      recordId: record.id,
      message,
      severity: message.startsWith('VAT amount') ? 'warning' : 'error'
    }))
  ));

  if (!segments.length) {
    errors.push(createRecordIssue('input', 'Paste supplier data before processing.'));
  }

  let staggeredOutput: string | null = null;
  if (input.mode === 'staggered') {
    const frontSize = normalizeTyreSize(input.frontSize ?? '');
    const rearSize = normalizeTyreSize(input.rearSize ?? '');
    errors.push(...validateStaggeredSizes(input.frontSize, input.rearSize));
    if (frontSize && rearSize && frontSize !== rearSize) {
      staggeredOutput = formatStaggeredOutput(validRecords, input.rules, frontSize, rearSize);
    }
  }

  return {
    records,
    validRecords: standardRecords,
    reviewRecords,
    errors,
    standardOutput: formatStandardOutput(standardRecords, input.rules),
    staggeredOutput
  };
};
