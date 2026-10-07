import { InventoryItem, ProductType, TyreProduct } from './types';

export interface MetricTyreSize { width: number; profile: number; rim: number; display: string }
// Require a full metric size, avoiding partial widths, load indices and wheel sizes.
// LT is a construction marker, not a dimension: match it on either side of
// the size without requiring staff to include it in their search.
const sizePattern = () => /(?<![\d./])\b(?:(?:LT|P)\s*)?(\d{3})[\s/\-]*(\d{2})\s*(?:ZR|RF|R|[\/\-])?\s*(\d{2}(?:\.\d)?)(?:\s*(?:CP|C|LT))?\b(?![.\d/])/gi;
const fromMatch = (match: RegExpMatchArray): MetricTyreSize | null => {
  const [width, profile, rim] = match.slice(1, 4).map(Number);
  if (width < 100 || width > 455 || profile < 20 || profile > 95 || rim < 10 || rim > 30) return null;
  return { width, profile, rim, display: `${width}/${profile}R${rim}` };
};
export const parseMetricTyreSize = (input: string): MetricTyreSize | null => {
  const matches = [...input.trim().matchAll(sizePattern())];
  if (matches.length !== 1 || matches[0][0].length !== input.trim().length) return null;
  return fromMatch(matches[0]);
};
export const extractSingleMetricTyreQuery = (query: string) => {
  const matches = [...query.matchAll(sizePattern())];
  if (matches.length !== 1) return null;
  const size = fromMatch(matches[0]);
  if (!size) return null;
  const match = matches[0];
  return { ...size, remainingQuery: `${query.slice(0, match.index)} ${query.slice(match.index! + match[0].length)}`.trim() };
};
export const extractStaggeredTyreQuery = (query: string) => {
  const matches = [...query.matchAll(sizePattern())];
  if (matches.length !== 2) return null;
  const first = fromMatch(matches[0]);
  const second = fromMatch(matches[1]);
  if (!first || !second) return null;
  const between = query.slice(matches[0].index! + matches[0][0].length, matches[1].index);
  if (!/^\s*(?:\+|&|\||,|and|or|\/)\s*$/i.test(between)) return null;
  const remainingQuery = `${query.slice(0, matches[0].index)} ${query.slice(matches[1].index! + matches[1][0].length)}`.trim();
  const [narrow, wide] = [first, second].sort((a, b) => a.width - b.width);
  return { narrow, wide, remainingQuery };
};
export const matchesMetricTyreSize = (item: InventoryItem, size: MetricTyreSize) => {
  if (item.type !== ProductType.TYRE) return false;
  // Supplier size fields may include a load/speed suffix.
  const match = [...(item as TyreProduct).size.matchAll(sizePattern())][0];
  const parsed = match && fromMatch(match);
  return Boolean(parsed && parsed.width === size.width && parsed.profile === size.profile && parsed.rim === size.rim);
};
export const buildStaggeredTyreQuery = (narrowInput: string, wideInput: string, terms = '') => {
  const narrow = parseMetricTyreSize(narrowInput);
  const wide = parseMetricTyreSize(wideInput);
  if (!narrow || !wide) return { error: 'Enter both full sizes, for example 225/40R18 and 255/35R18.' };
  if (narrow.width >= wide.width) return { error: 'The wide tyre must have a greater width than the narrow tyre.' };
  if (/[+|&]/.test(terms) || [...terms.matchAll(sizePattern())].length) return { error: 'Use the optional filter for a brand or pattern only.' };
  return { query: `${narrow.display} + ${wide.display}${terms.trim() ? ` ${terms.trim()}` : ''}` };
};
