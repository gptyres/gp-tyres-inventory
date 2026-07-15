export const normalizeSupplierImageToken = (value = '') => (
  String(value ?? '')
    .normalize('NFKD')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

export const cleanSupplierTyrePatternKey = (brand = '', pattern = '') => {
  const brandKey = normalizeSupplierImageToken(brand);
  let patternKey = normalizeSupplierImageToken(pattern || brand || 'TYRE');

  if (brandKey) {
    const escapedBrandKey = brandKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    patternKey = patternKey.replace(new RegExp(`\\b${escapedBrandKey}\\b`, 'g'), ' ');
  }

  patternKey = patternKey
    .replace(/\b(?:LT|P)?\d{3}\s*\/\s*\d{2}\s*R?\s*\d{2}(?:C|LT)?\b/g, ' ')
    .replace(/\b\d{3}\s*\/\s*\d{2}\s*\/\s*\d{2}\b/g, ' ')
    .replace(/\b\d{3}\s+\d{2}\s*R?\s*\d{2}(?:C|LT)?\b/g, ' ')
    .replace(/\b\d{3}\s+\d{2}\s+\d{2}\b/g, ' ')
    .replace(/\b\d{2,3}\s*R\s*\d{2}(?:C|LT)?\b/g, ' ')
    .replace(/\b\d{2,3}\s+R\s*\d{2}(?:C|LT)?\b/g, ' ')
    .replace(/\b\d{2,3}\s*\/\s*\d{2,3}\b/g, ' ')
    .replace(/\b\d{2,3}\s*[A-Z]\b/g, ' ')
    .replace(/\b(?:LOAD|SPEED|INDEX|IDX)\s+\d+\b/g, ' ')
    .replace(/\b(?:LOAD|SPEED|INDEX|IDX|SIZE|SKU|STOCK|CODE|TYRE|TYRES|TIRE|TIRES|IMP)\b/g, ' ')
    .replace(/\b(?:XL|RF|RFT|RUN FLAT|STD|TL|TT|PR|PLY|OWL|RWL|BSW|RPB|FR)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return patternKey || brandKey || 'TYRE';
};

export const parseSupplierTyreImageKeys = (brand = '', pattern = '') => ({
  designKey: cleanSupplierTyrePatternKey(brand, pattern),
  finishKey: normalizeSupplierImageToken(brand)
});
