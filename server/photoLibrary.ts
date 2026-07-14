import { createSupabaseAdmin } from './supabaseAdmin.js';
import { GP_ORGANIZATION_ID, verifyStaffSession } from './staffSession.js';

export const PHOTO_LIST_FIELDS = [
  'id', 'organization_id', 'supplier_id', 'product_id', 'product_type', 'brand',
  'pattern', 'tyre_size', 'wheel_size', 'description', 'bucket_name', 'storage_path',
  'thumbnail_path', 'public_image_url', 'original_filename', 'display_filename',
  'status', 'is_customer_ready', 'is_verified', 'is_duplicate', 'source_url',
  'source_name', 'width', 'height', 'mime_type', 'file_size', 'tags', 'created_at',
  'updated_at', 'supplier'
].join(',');

export const requireStaffSession = (request: any, response: any) => {
  try {
    const session = verifyStaffSession(request);
    if (!session) {
      response.status(401).json({ error: 'Your staff session has expired. Sign in again.' });
      return null;
    }
    return session;
  } catch (error) {
    response.status(503).json({
      error: error instanceof Error ? error.message : 'Staff session is unavailable.'
    });
    return null;
  }
};

export const sanitizePhotoIds = (value: unknown, maximum = 30) => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => (
    typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)
  )))].slice(0, maximum);
};

export const buildCustomerPhotoFilename = (photo: Record<string, any>, index?: number) => {
  const extension = String(photo.mime_type || '').includes('png')
    ? 'png'
    : String(photo.mime_type || '').includes('webp')
      ? 'webp'
      : 'jpg';
  const parts = [photo.brand, photo.pattern, photo.tyre_size || photo.wheel_size]
    .filter(Boolean)
    .map(String);
  const base = parts.join('-')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'GP-Tyres-Photo';
  return `${typeof index === 'number' ? `${String(index + 1).padStart(2, '0')}-` : ''}${base}.${extension}`;
};

export const makeThumbnailUrl = (photo: Record<string, any>) => {
  const original = String(photo.public_image_url || '');
  if (!original.includes('/storage/v1/object/public/')) return original;
  const separator = original.includes('?') ? '&' : '?';
  return `${original.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')}${separator}width=640&height=480&resize=contain&quality=72`;
};

export const resolvePhotoUrl = async (photo: Record<string, any>, expiresIn = 600) => {
  if (photo.public_image_url) return String(photo.public_image_url);
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(String(photo.bucket_name))
    .createSignedUrl(String(photo.storage_path), expiresIn);
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Could not sign photo URL.');
  return data.signedUrl;
};

export const loadAuthorizedPhotos = async (ids: string[]) => {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('photos')
    .select(PHOTO_LIST_FIELDS)
    .eq('organization_id', GP_ORGANIZATION_ID)
    .eq('active', true)
    .in('id', ids);
  if (error) throw new Error(error.message);
  return (data || []) as unknown as Record<string, any>[];
};

export const recordPhotoActivity = async (
  terminalId: string,
  action: string,
  photoId?: string | null,
  metadata: Record<string, unknown> = {}
) => {
  const supabase = createSupabaseAdmin();
  const { error } = await supabase.from('photo_activity').insert({
    organization_id: GP_ORGANIZATION_ID,
    user_id: terminalId,
    photo_id: photoId || null,
    action,
    metadata
  });
  if (error) console.warn('[PHOTO LIBRARY] Audit insert failed:', error.message);
};
