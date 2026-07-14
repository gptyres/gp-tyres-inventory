import { createSupabaseAdmin } from '../../server/supabaseAdmin.js';
import { GP_ORGANIZATION_ID } from '../../server/staffSession.js';
import { makeThumbnailUrl, PHOTO_LIST_FIELDS, requireStaffSession, resolvePhotoUrl } from '../../server/photoLibrary.js';

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const safeText = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 160) : '';
const normalizeSearch = (value: string) => value
  .replace(/(\d{2,3})\s*[\/-]\s*(\d{2})\s*[rR\/-]?\s*(\d{2})/g, '$1 $2 $3')
  .replace(/[^a-zA-Z0-9"' -]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export default async function handler(request: any, response: any) {
  response.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
  const session = requireStaffSession(request, response);
  if (!session) return;

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Unsupported method.' });
  }

  try {
    const supabase = createSupabaseAdmin();
    const page = clamp(Number.parseInt(String(request.query?.page || '1'), 10) || 1, 1, 10000);
    const pageSize = clamp(Number.parseInt(String(request.query?.pageSize || '60'), 10) || 60, 12, 100);
    const offset = (page - 1) * pageSize;
    const search = normalizeSearch(safeText(request.query?.search));
    const customerReady = safeText(request.query?.customerReady);
    const verified = safeText(request.query?.verified);
    const filters = {
      supplier: safeText(request.query?.supplier),
      brand: safeText(request.query?.brand),
      pattern: safeText(request.query?.pattern),
      tyreSize: safeText(request.query?.tyreSize),
      wheelSize: safeText(request.query?.wheelSize),
      productType: safeText(request.query?.productType),
      status: safeText(request.query?.status),
      tag: safeText(request.query?.tag),
      source: safeText(request.query?.source),
      dateFrom: safeText(request.query?.dateFrom)
    };

    let query = supabase
      .from('photos')
      .select(PHOTO_LIST_FIELDS, { count: 'exact' })
      .eq('organization_id', GP_ORGANIZATION_ID)
      .eq('active', true);

    if (search) query = query.textSearch('search_document', search, { config: 'simple', type: 'websearch' });
    if (filters.supplier) query = query.eq('supplier', filters.supplier);
    if (filters.brand) query = query.eq('brand', filters.brand);
    if (filters.pattern) query = query.eq('pattern', filters.pattern);
    if (filters.tyreSize) query = query.eq('tyre_size', filters.tyreSize);
    if (filters.wheelSize) query = query.eq('wheel_size', filters.wheelSize);
    if (filters.productType) query = query.eq('product_type', filters.productType);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.tag) query = query.contains('tags', [filters.tag]);
    if (filters.source) query = query.eq('source_name', filters.source);
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
    if (customerReady === 'true' || customerReady === 'false') query = query.eq('is_customer_ready', customerReady === 'true');
    if (verified === 'true' || verified === 'false') query = query.eq('is_verified', verified === 'true');

    const sort = safeText(request.query?.sort);
    if (sort === 'brand') query = query.order('brand', { ascending: true, nullsFirst: false }).order('pattern', { ascending: true, nullsFirst: false });
    else if (sort === 'pattern') query = query.order('pattern', { ascending: true, nullsFirst: false });
    else query = query.order('created_at', { ascending: false }).order('id', { ascending: true });

    const [{ data, error, count }, facetResult] = await Promise.all([
      query.range(offset, offset + pageSize - 1),
      supabase
        .from('photos')
        .select('supplier,brand,pattern,tyre_size,wheel_size,product_type,status,source_name,tags')
        .eq('organization_id', GP_ORGANIZATION_ID)
        .eq('active', true)
        .limit(5000)
    ]);

    if (error) throw new Error(error.message);
    if (facetResult.error) throw new Error(facetResult.error.message);
    const facetRows = facetResult.data || [];
    const unique = (values: unknown[]) => [...new Set(values.filter((value): value is string => typeof value === 'string' && value.trim() !== ''))]
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

    const hydratedPhotos = await Promise.all((data || []).map(async (photo: Record<string, any>) => {
      const previewUrl = photo.public_image_url || await resolvePhotoUrl(photo, 900);
      return {
        ...photo,
        thumbnail_url: photo.public_image_url ? makeThumbnailUrl(photo) : previewUrl,
        preview_url: previewUrl
      };
    }));

    return response.status(200).json({
      photos: hydratedPhotos,
      page,
      pageSize,
      total: count || 0,
      facets: {
        suppliers: unique(facetRows.map((row: any) => row.supplier)),
        brands: unique(facetRows.map((row: any) => row.brand)),
        patterns: unique(facetRows.map((row: any) => row.pattern)),
        tyreSizes: unique(facetRows.map((row: any) => row.tyre_size)),
        wheelSizes: unique(facetRows.map((row: any) => row.wheel_size)),
        productTypes: unique(facetRows.map((row: any) => row.product_type)),
        statuses: unique(facetRows.map((row: any) => row.status)),
        sources: unique(facetRows.map((row: any) => row.source_name)),
        tags: unique(facetRows.flatMap((row: any) => Array.isArray(row.tags) ? row.tags : [])).slice(0, 250)
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Photo library could not be loaded.';
    return response.status(500).json({ error: message });
  }
}
