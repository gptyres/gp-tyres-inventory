import { ProductType, type InventoryItem, type WheelProduct } from './types';
import { expandWheelFitmentSearchText } from './alineFitment';
export interface WheelFilters { vehicle?: string; pcd?: string; diameter?: string; width?: string }

const dimensionPattern = /\b(1[2-9]|2\d|30)\s*[x×*]\s*(\d{1,2}(?:\.\d+)?)\s*J?\b/i;
const reverseDimensionPattern = /\b(\d{1,2}(?:\.\d+)?)\s*J?\s*[x×*]\s*(1[2-9]|2\d|30)\b/i;
const pcdPattern = /\b([3-8])\s*[x×/]\s*(\d{2,3}(?:\.\d+)?)\b/gi;
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();
const termsMatch = (value: string, query: string) => normalize(query).split(/\s+/).filter(Boolean).every(term => normalize(value).includes(term));
const canonicalPcd = (bolts: string, circle: string) => `${Number(bolts)}x${Number(circle)}`;
const pcds = (value: string) => [...value.matchAll(new RegExp(pcdPattern))].map(match => canonicalPcd(match[1], match[2]));

export const parseWheelDimensions = (size: string): { diameter: string; width: string } => {
  if (!size) return { diameter: '', width: '' };
  const forward = size.match(dimensionPattern);
  if (forward) return { diameter: String(Number(forward[1])), width: String(Number(forward[2])) };
  const reverse = size.match(reverseDimensionPattern);
  if (reverse) return { diameter: String(Number(reverse[2])), width: String(Number(reverse[1])) };
  const diameter = size.match(/^\s*(1[2-9]|2\d|30)\s*(?:inch(?:es)?|["”])?\s*$/i);
  return { diameter: diameter ? String(Number(diameter[1])) : '', width: '' };
};

export const isWheelSearchQuery = (query: string): boolean => {
  // Do not treat flotation or metric tyre sizes as wheel dimensions.
  if (/\d\s*(?:ZR|R)\s*\d/i.test(query) || /\b\d{3}[/\s-]\d{2,3}[/\s-]\d{2}\b/.test(query)) return false;
  return dimensionPattern.test(query) || reverseDimensionPattern.test(query) || pcds(query).length > 0
    || /\b(?:wheels?|rims?)\b|\b(?:1[2-9]|2\d|30)\s*(?:inch(?:es)?\b|["”])/i.test(query);
};

export const getWheelFilterOptions = (items: InventoryItem[]) => {
  const sizes = items.filter((item): item is WheelProduct => item.type === ProductType.WHEEL).map(item => parseWheelDimensions(item.size));
  const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => Number(a) - Number(b));
  return { diameters: unique(sizes.map(size => size.diameter)), widths: unique(sizes.map(size => size.width)) };
};

export const filterWheelInventory = (
  items: InventoryItem[], query: string, filters: WheelFilters,
  getSellingPrice: (wheel: WheelProduct) => number = wheel => wheel.sellingPrice
): WheelProduct[] => {
  let remaining = query.trim();
  // A labelled ET value is an offset, never a bare wheel diameter.
  const offsets: number[] = [];
  remaining = remaining.replace(/\b(?:ET|OFFSET)\s*([+-]?\s*\d+(?:\.\d+)?)\b/gi, (_match, offset: string) => {
    offsets.push(Number(offset.replace(/\s/g, '')));
    return ' ';
  });
  const dimensions = remaining.match(dimensionPattern) || remaining.match(reverseDimensionPattern);
  const querySize = parseWheelDimensions(dimensions?.[0] || '');
  let queryDiameter = querySize.diameter;
  const queryWidth = querySize.width;
  if (dimensions) remaining = remaining.replace(dimensions[0], ' ');
  const queryPcds = pcds(remaining);
  remaining = remaining.replace(pcdPattern, ' ');
  const diameter = remaining.match(/(?<![\w./])(?:1[2-9]|2\d|30)(?:\s*(?:inch(?:es)?\b|["”]))?(?![\w./])/i);
  if (!queryDiameter && diameter) {
    queryDiameter = String(Number(diameter[0].match(/\d+/)![0]));
    remaining = remaining.replace(diameter[0], ' ');
  }
  remaining = remaining.replace(/\b(?:wheels?|rims?)\b/gi, ' ');
  const filterPcd = (filters.pcd || '').trim();
  const requestedPcds = pcds(filterPcd);

  return items.filter((item): item is WheelProduct => {
    if (item.type !== ProductType.WHEEL) return false;
    const wheel = item as WheelProduct;
    const size = parseWheelDimensions(wheel.size);
    const itemOffset = (wheel.offset || '').replace(/^ET\s*/i, '').trim();
    if (offsets.length && (!itemOffset || offsets.some(offset => Number(itemOffset) !== offset))) return false;
    if ([queryDiameter, filters.diameter].some(value => value && value !== size.diameter)) return false;
    if ([queryWidth, filters.width].some(value => value && value !== size.width)) return false;
    const itemPcds = pcds(wheel.pcd || '');
    if ([...queryPcds, ...requestedPcds].some(value => !itemPcds.includes(value))) return false;
    // A partial/unrecognised PCD must not silently remove the constraint.
    if (filterPcd && !requestedPcds.length && (!normalize(filterPcd) || !normalize(wheel.pcd || '').includes(normalize(filterPcd)))) return false;
    const fitment = `${wheel.vehicleFitments || ''} ${expandWheelFitmentSearchText(wheel.vehicleFitments || '')}`;
    if (!termsMatch(fitment, filters.vehicle || '')) return false;
    const sellingPrice = getSellingPrice(wheel);
    const fields = [wheel.code, wheel.brand, wheel.finish, wheel.size, wheel.pcd, wheel.colour,
      wheel.offset ? `ET${wheel.offset}` : '', wheel.centerBore ? `CB${wheel.centerBore}` : '',
      wheel.supplierStockCode, wheel.supplierName, fitment,
      Number.isFinite(sellingPrice) ? `R${sellingPrice} ${sellingPrice}` : ''];
    const searchable = fields.flatMap(field => [field || '', normalize(field || '').replace(/\s/g, '')]).join(' ');
    return termsMatch(searchable, remaining);
  });
};
