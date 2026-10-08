// Match service descriptions, not ply ratings, sizes, model numbers or SKUs.
export const TYRE_SERVICE_DESCRIPTION_PATTERN = /(?<![A-Z0-9./])(\d{2,3}(?:\s*\/\s*\d{2,3})?)\s*(\([WY]\)|A[1-8]|[BCDEFGHJKLMNPQRSTUVWY])(?=$|[\s),;|]|XL\b|REINF\b)/gi;

export interface TyreServiceDescription {
  index: string;
  load: string;
  speed: string;
}

const empty = (): TyreServiceDescription => ({ index: '', load: '', speed: '' });

export function extractTyreServiceDescription(...values: unknown[]): TyreServiceDescription {
  for (const value of values) {
    const matches = [...String(value ?? '').toUpperCase().matchAll(TYRE_SERVICE_DESCRIPTION_PATTERN)]
      .filter(m => m[1].split('/').every(n => Number(n.trim()) >= 20 && Number(n.trim()) <= 199));
    const unique = new Map(matches.map(m => {
      const load = m[1].replace(/\s/g, '');
      const speed = m[2];
      return [load + speed, { index: load + speed, load, speed }];
    }));
    if (unique.size === 1) return [...unique.values()][0];
    if (unique.size > 1) return empty();
  }
  return empty();
}

export function getTyreServiceDescription(tyre: {
  tyreIndex?: string; loadSpeedIndex?: string; tyreRating?: string;
  pattern?: string; tyreSpecs?: string;
}): TyreServiceDescription {
  return extractTyreServiceDescription(tyre.tyreIndex, tyre.loadSpeedIndex, tyre.tyreRating, tyre.pattern, tyre.tyreSpecs);
}

export function supplierSourceServiceDescription(detail?: string | null): string {
  if (!detail) return '';
  let source: any;
  try { source = JSON.parse(detail); } catch { return ''; }
  // Only the current product's documented metadata containers are read. Never
  // scan prices, stock, historical snapshots or arbitrary nested text for ratings.
  const objects = [source, source?.raw, source?.product,
    ...(Array.isArray(source?.sources) ? source.sources.map((s: any) => s?.raw) : [])];
  const results = new Set<string>();
  for (const object of objects) {
    if (!object || typeof object !== 'object' || Array.isArray(object)) continue;
    const fields = Object.fromEntries(Object.entries(object).map(([k, v]) => [k.replace(/[^a-z0-9]/gi, '').toLowerCase(), v]));
    const load = fields.loadrating ?? fields.loadindex ?? fields.uciiloadrading;
    const speed = fields.speedrating ?? fields.speedindex ?? fields.uciispeedrating;
    const index = extractTyreServiceDescription(
      load != null && speed != null ? `${load}${speed}` : '',
      fields.loadspeedindex, fields.tyreindex,
      fields.productspecifications, fields.description1, fields.uciiproductdesc, fields.productdescription,
      fields.productname, fields.description, fields.name
    ).index;
    if (index) results.add(index);
  }
  return results.size === 1 ? [...results][0] : '';
}
