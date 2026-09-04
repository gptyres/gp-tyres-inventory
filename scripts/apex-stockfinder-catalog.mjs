const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export const isApexSeller = (row, configuredSeller = '') => {
  const actualSeller = clean(row?.seller_name);
  const requestedSeller = clean(configuredSeller);
  if (requestedSeller) return actualSeller.toUpperCase() === requestedSeller.toUpperCase();
  return /\bAPEX\b/i.test(actualSeller);
};

export const selectCompleteApexTyres = (rows, configuredSeller = '') => rows
  .filter((row) => clean(row?.stock_type || 'TYRE').toUpperCase() === 'TYRE')
  .filter((row) => isApexSeller(row, configuredSeller));

