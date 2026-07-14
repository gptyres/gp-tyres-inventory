import React, { useEffect, useState } from 'react';
import { fetchPhotoUrl, PhotoRecord } from '../../photoLibrary';

interface PhotoPreviewModalProps {
  photo: PhotoRecord | null;
  hasPrevious: boolean;
  hasNext: boolean;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onCopy: () => void;
  onDownload: () => void;
}

export const PhotoPreviewModal: React.FC<PhotoPreviewModalProps> = ({ photo, hasPrevious, hasNext, onClose, onPrevious, onNext, onCopy, onDownload }) => {
  const [imageUrl, setImageUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!photo) return;
    let cancelled = false;
    const fallbackUrl = photo.preview_url || photo.public_image_url || '';
    setImageUrl(fallbackUrl);
    setError('');
    void fetchPhotoUrl(photo.id, 'preview')
      .then((result) => { if (!cancelled) setImageUrl(result.url); })
      .catch((loadError) => { if (!cancelled && !fallbackUrl) setError(loadError instanceof Error ? loadError.message : 'Photo could not be loaded.'); });
    return () => { cancelled = true; };
  }, [photo?.id]);

  useEffect(() => {
    if (!photo) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && hasPrevious) onPrevious();
      if (event.key === 'ArrowRight' && hasNext) onNext();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [photo, hasPrevious, hasNext, onClose, onPrevious, onNext]);

  if (!photo) return null;
  const title = photo.pattern || photo.description || photo.display_filename || 'Photo preview';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="photo-preview-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="flex max-h-[96dvh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-gp-border bg-gp-dark shadow-2xl lg:flex-row">
        <div className="relative flex min-h-[48dvh] flex-1 items-center justify-center bg-black p-3 lg:min-h-[78dvh]">
          {imageUrl ? <img src={imageUrl} alt={title} className="max-h-[76dvh] max-w-full object-contain" /> : <p className="text-sm font-bold text-gp-text-muted">{error || 'Loading preview...'}</p>}
          <button type="button" disabled={!hasPrevious} onClick={onPrevious} aria-label="Previous photo" className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/70 text-2xl text-white disabled:hidden">‹</button>
          <button type="button" disabled={!hasNext} onClick={onNext} aria-label="Next photo" className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/70 text-2xl text-white disabled:hidden">›</button>
        </div>
        <aside className="w-full shrink-0 border-t border-gp-border p-5 lg:w-80 lg:border-l lg:border-t-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gp-red">{photo.product_type || 'Photo'}</p>
              <h2 id="photo-preview-title" className="mt-1 break-words text-xl font-black uppercase text-white">{title}</h2>
            </div>
            <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-gp-border text-xl text-gp-text-muted hover:text-white" aria-label="Close preview">×</button>
          </div>

          <dl className="mt-6 space-y-3 text-xs">
            {[
              ['Brand', photo.brand],
              ['Size', photo.tyre_size || photo.wheel_size],
              ['Supplier', photo.supplier],
              ['Status', photo.status.replaceAll('_', ' ')],
              ['Verified', photo.is_verified ? 'Yes' : 'No'],
              ['Source', photo.source_name],
              ['Filename', photo.display_filename]
            ].map(([label, value]) => value ? (
              <div key={label} className="border-b border-gp-border pb-2">
                <dt className="text-[9px] font-black uppercase tracking-wider text-gp-text-muted">{label}</dt>
                <dd className="mt-1 break-words font-bold text-gp-text-main">{value}</dd>
              </div>
            ) : null)}
          </dl>

          <div className="mt-6 grid grid-cols-2 gap-2">
            <button type="button" onClick={onCopy} className="min-h-11 rounded bg-gp-red px-3 text-xs font-black uppercase text-white hover:bg-red-700">Copy image</button>
            <button type="button" onClick={onDownload} className="min-h-11 rounded border border-gp-border bg-gp-input px-3 text-xs font-black uppercase text-white hover:border-white">Download</button>
          </div>
          {photo.source_url && <a href={photo.source_url} target="_blank" rel="noreferrer" className="mt-3 block truncate text-[11px] font-bold text-blue-400 hover:underline">Open source page</a>}
        </aside>
      </div>
    </div>
  );
};
