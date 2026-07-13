import type { WheelCatalogItemRow } from './supabaseClient';

const normalizeSearchText = (value: string) => value
  .toLowerCase()
  .replace(/\u00c3\u2014/g, 'x')
  .replace(/[\u00d7/]/g, 'x')
  .replace(/\bcent(?:re|er)\s*bore\b/g, 'cb')
  .replace(/\bmachine(?:d)?\s*face\b/g, 'machine face')
  .replace(/\bmachined\b/g, 'machine')
  .replace(/\b(?:inch|inches)\b/g, ' ')
  .replace(/["']/g, '')
  .replace(/[^a-z0-9.]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const pcdVariants = (value: string) => {
  const normalized = normalizeSearchText(value).replace(/\s+/g, '');
  return [normalized, normalized.replace('.3', ''), normalized.replace('.7', '')];
};

export const itemMatchesWheelSearch = (item: WheelCatalogItemRow, query: string) => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const specificationTags = [
    item.rim_size ? `${item.rim_size} INCH` : '',
    item.wheel_offset ? `ET${item.wheel_offset}` : '',
    item.center_bore ? `CB${item.center_bore}` : '',
    item.center_bore ? `CENTER BORE ${item.center_bore}` : '',
    item.load_rating ? `${item.load_rating}KG` : '',
    item.finish?.replace(/machined/gi, 'machine') ?? ''
  ];
  const haystack = normalizeSearchText([
    item.file_name,
    item.folder_path,
    item.category ?? '',
    item.rim_size ?? '',
    item.pcd ?? '',
    ...(item.pcd_aliases ?? []),
    item.local_relative_path ?? '',
    item.brand ?? '',
    item.model ?? '',
    item.wheel_size ?? '',
    item.width ?? '',
    item.finish ?? '',
    item.colour ?? '',
    item.wheel_offset ?? '',
    item.center_bore ?? '',
    item.load_rating ?? '',
    ...(item.vehicle_hints ?? []),
    item.image_ocr_text ?? '',
    item.image_spec_text ?? '',
    ...specificationTags,
    ...(item.tags ?? [])
  ].join(' '));

  return normalizedQuery.split(' ').every((token) => haystack.includes(token));
};

export const wheelMatchesVehiclePcd = (item: WheelCatalogItemRow, vehiclePcds: string[]) => {
  if (!vehiclePcds.length) return true;
  const itemVariants = [item.pcd ?? '', ...(item.pcd_aliases ?? [])].flatMap(pcdVariants);
  return vehiclePcds.some((pcd) => pcdVariants(pcd).some((candidate) => itemVariants.includes(candidate)));
};
