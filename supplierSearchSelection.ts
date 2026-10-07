// Legacy arrays cannot distinguish "all" from an old, incomplete catalogue list.
// Migrate them to all once; subsequently preserve explicit custom selections.
export const restoreSupplierSearchSelection = <T extends string>(raw: string | null, catalogs: readonly T[]): T[] => {
  try {
    const saved = raw ? JSON.parse(raw) : null;
    if (saved?.version === 2 && saved.mode === 'selected' && Array.isArray(saved.catalogs)) {
      return catalogs.filter(catalog => saved.catalogs.includes(catalog));
    }
  } catch { /* Invalid browser preferences must not hide catalogues. */ }
  return [...catalogs];
};

export const serializeSupplierSearchSelection = <T extends string>(selected: readonly T[], catalogs: readonly T[]): string => (
  JSON.stringify({ version: 2, mode: catalogs.every(catalog => selected.includes(catalog)) ? 'all' : 'selected', catalogs: selected })
);
