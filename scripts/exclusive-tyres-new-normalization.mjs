const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export const cleanExclusiveTyresNewPattern = (value, brandValue = '') => {
  let pattern = clean(value).toUpperCase();
  const brand = clean(brandValue).toUpperCase();
  const supplierCodes = '(?:IMP|GDY|CON|DUN|BST|PIR|GEN|FST)';

  pattern = pattern
    .replace(/^[\s\-–—]+/, '')
    .replace(new RegExp(`^(?:TYRES?\\s+)?${supplierCodes}\\s+`, 'i'), '')
    .replace(new RegExp(`\\b${supplierCodes}\\b`, 'gi'), ' ')
    .replace(/\bTYRES?\b/gi, ' ')
    .replace(/\b(?:LIST|PRICE|GP)\b/gi, ' ')
    .replace(/\b(?:BSW|RWL|OWL|XL|RUN\s*FLAT|RUNFLAT|RFT|TLR|TL|TT)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (brand) {
    const escapedBrand = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pattern = pattern.replace(new RegExp(`^${escapedBrand}\\s+`, 'i'), '').trim();
  }
  if (brand === 'ANCHEE') pattern = pattern.replace(/^ACHEE\s+/i, '').trim();

  pattern = pattern
    .replace(/^(?:(?:\d{2,3}(?:\s*\/\s*\d{2,3})?[A-Z]?(?:XL)?|\d{1,2}\s*PR)\s+)+/i, '')
    .replace(/^[-/|,:;\s]+|[-/|,:;\s]+$/g, '')
    .replace(/\bX\s+PRIVILO\b/gi, 'X-PRIVILO')
    .replace(/\bH\s+P\b/gi, 'H/P')
    .replace(/\s+/g, ' ')
    .trim();

  return /^(?:-|N\/?A|NONE|UNKNOWN|RADIAL|PCR|TBR)$/i.test(pattern) ? '' : pattern;
};
