export type PhotoStatus =
  | 'raw'
  | 'review_required'
  | 'approved'
  | 'customer_ready'
  | 'rejected'
  | 'duplicate'
  | 'archived';

export interface PhotoRecord {
  id: string;
  organization_id: string;
  supplier_id: string | null;
  product_id: string | null;
  supplier: string | null;
  product_type: 'TYRE' | 'WHEEL' | 'COILOVER' | 'OTHER' | null;
  brand: string | null;
  pattern: string | null;
  tyre_size: string | null;
  wheel_size: string | null;
  description: string | null;
  bucket_name: string;
  storage_path: string;
  thumbnail_path: string | null;
  public_image_url: string | null;
  original_filename: string | null;
  display_filename: string | null;
  status: PhotoStatus;
  is_customer_ready: boolean;
  is_verified: boolean;
  is_duplicate: boolean;
  source_url: string | null;
  source_name: string | null;
  width: number | null;
  height: number | null;
  mime_type: string | null;
  file_size: number | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  thumbnail_url: string | null;
  preview_url: string | null;
}

export interface PhotoFacets {
  suppliers: string[];
  brands: string[];
  patterns: string[];
  tyreSizes: string[];
  wheelSizes: string[];
  productTypes: string[];
  statuses: PhotoStatus[];
  sources: string[];
  tags: string[];
}

export interface PhotoFilters {
  search: string;
  supplier: string;
  brand: string;
  pattern: string;
  tyreSize: string;
  wheelSize: string;
  productType: string;
  status: string;
  customerReady: string;
  verified: string;
  tag: string;
  source: string;
  dateFrom: string;
  sort: 'recent' | 'brand' | 'pattern';
}

export interface PhotoListResponse {
  photos: PhotoRecord[];
  page: number;
  pageSize: number;
  total: number;
  facets: PhotoFacets;
}

export interface AuthorizedPhotoFile {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

const apiRequest = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, { ...init, credentials: 'same-origin' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'The photo library request failed.');
  return payload as T;
};

export const fetchPhotos = async (
  filters: PhotoFilters,
  page: number,
  pageSize: number,
  signal?: AbortSignal
) => {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== 'ALL' && !(key === 'sort' && value === 'recent')) params.set(key, value);
  });
  return apiRequest<PhotoListResponse>(`/api/photos?${params.toString()}`, { signal });
};

export const fetchPhotoUrl = async (photoId: string, purpose: 'preview' | 'clipboard' | 'download') => (
  apiRequest<{ url: string; expiresIn: number | null }>('/api/photos/signed-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoId, purpose })
  })
);

export const preparePhotoFiles = async (photoIds: string[]) => {
  const uniqueIds = [...new Set(photoIds)];
  const batches = Array.from({ length: Math.ceil(uniqueIds.length / 30) }, (_, index) => (
    uniqueIds.slice(index * 30, (index + 1) * 30)
  ));
  const results = await Promise.all(batches.map((batch) => (
    apiRequest<{ files: AuthorizedPhotoFile[] }>('/api/photos/batch-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoIds: batch })
    })
  )));
  return { files: results.flatMap((result) => result.files) };
};

export const recordPhotoAction = async (photoIds: string[], action: 'photo_copied' | 'photo_downloaded' | 'photo_shared') => {
  await apiRequest<{ ok: boolean }>('/api/photos/activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoIds, action })
  });
};

export const updatePhotoStatus = async (photoIds: string[], status: PhotoStatus) => (
  apiRequest<{ ok: boolean; updated: number }>('/api/photos/status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoIds, status })
  })
);

export const EMPTY_PHOTO_FACETS: PhotoFacets = {
  suppliers: [],
  brands: [],
  patterns: [],
  tyreSizes: [],
  wheelSizes: [],
  productTypes: [],
  statuses: [],
  sources: [],
  tags: []
};

export const DEFAULT_PHOTO_FILTERS: PhotoFilters = {
  search: '',
  supplier: 'ALL',
  brand: 'ALL',
  pattern: 'ALL',
  tyreSize: 'ALL',
  wheelSize: 'ALL',
  productType: 'ALL',
  status: 'ALL',
  customerReady: 'true',
  verified: 'ALL',
  tag: 'ALL',
  source: 'ALL',
  dateFrom: '',
  sort: 'recent'
};
