/**
 * Resize JPEG uploads before hashing and storage. GIF and WebP may be animated,
 * while PNG may carry transparency; leave them untouched. A browser that cannot
 * decode or encode the image simply uploads the original.
 */
export async function optimizeImageUpload(
  file: File,
  encode: (file: File) => Promise<File> = encodeJpeg,
): Promise<File> {
  if (file.type.toLowerCase() !== 'image/jpeg' || file.size < 100_000) return file;
  try {
    const result = await encode(file);
    return result.type === file.type && result.size < file.size * 0.9 ? result : file;
  } catch {
    return file;
  }
}

async function encodeJpeg(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image canvas unavailable');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Image encoding failed')), 'image/jpeg', 0.84);
    });
    return new File([blob], file.name, { type: blob.type, lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}
