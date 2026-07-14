import React from 'react';
import { PhotoRecord } from '../../photoLibrary';

interface PhotoCardProps {
  photo: PhotoRecord;
  index: number;
  selected: boolean;
  focused: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onDoubleClick: () => void;
  onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onFocus: () => void;
}

const labelFor = (photo: PhotoRecord) => [photo.brand, photo.pattern, photo.tyre_size || photo.wheel_size].filter(Boolean).join(' ') || 'Product photo';

export const PhotoCard = React.memo<PhotoCardProps>(({
  photo,
  index,
  selected,
  focused,
  onClick,
  onDoubleClick,
  onContextMenu,
  onFocus
}) => {
  const title = photo.pattern || photo.description || photo.display_filename || 'Product photo';
  const size = photo.tyre_size || photo.wheel_size;

  return (
    <button
      type="button"
      role="gridcell"
      aria-selected={selected}
      aria-label={`${labelFor(photo)}${selected ? ', selected' : ''}`}
      tabIndex={focused ? 0 : -1}
      data-photo-card
      data-photo-index={index}
      data-photo-id={photo.id}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onFocus={onFocus}
      className={`group relative min-w-0 overflow-hidden rounded-lg border bg-gp-panel text-left transition focus:outline-none ${
        selected
          ? 'border-gp-red shadow-[0_0_0_2px_rgba(255,0,0,0.35)]'
          : 'border-gp-border hover:border-gp-text-muted'
      } ${focused ? 'ring-2 ring-white ring-offset-2 ring-offset-gp-black' : ''}`}
    >
      <div className={`absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded border text-sm font-black ${selected ? 'border-white bg-gp-red text-white' : 'border-white/60 bg-black/70 text-transparent group-hover:text-white/60'}`} aria-hidden="true">
        ✓
      </div>
      <div className={`aspect-[4/3] overflow-hidden bg-black ${selected ? 'bg-gp-red/10' : ''}`}>
        <img
          src={photo.thumbnail_url || photo.preview_url || ''}
          data-fallback-src={photo.preview_url || photo.public_image_url || ''}
          onError={(event) => {
            const image = event.currentTarget;
            const fallback = image.dataset.fallbackSrc;
            if (fallback && image.src !== fallback) image.src = fallback;
          }}
          alt={labelFor(photo)}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full w-full object-contain transition duration-200 group-hover:scale-[1.02]"
        />
      </div>
      <div className={`border-t p-3 ${selected ? 'border-gp-red/60 bg-gp-red/10' : 'border-gp-border'}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-black uppercase text-gp-text-main" title={title}>{title}</p>
            <p className="mt-1 truncate text-[11px] font-bold uppercase text-gp-text-muted">
              {[size, photo.brand].filter(Boolean).join(' / ') || photo.product_type || 'Photo'}
            </p>
          </div>
          <span className={`shrink-0 rounded px-1.5 py-1 text-[9px] font-black uppercase ${photo.is_customer_ready ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
            {photo.is_customer_ready ? 'Ready' : 'Review'}
          </span>
        </div>
        <p className="mt-2 truncate text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">{photo.supplier || photo.source_name || 'GP Tyres & Mags'}</p>
      </div>
    </button>
  );
});

PhotoCard.displayName = 'PhotoCard';

