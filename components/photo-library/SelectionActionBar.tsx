import React from 'react';

interface SelectionActionBarProps {
  count: number;
  busy: boolean;
  onCopyImages: () => void;
  onDownload: () => void;
  onShare: () => void;
  onPreview?: () => void;
  clipboardQueue?: { next: number; total: number } | null;
  onCopyNext?: () => void;
  onClear: () => void;
}

const actionClass = 'min-h-10 rounded px-3 text-xs font-black uppercase transition disabled:cursor-wait disabled:opacity-50';

export const SelectionActionBar: React.FC<SelectionActionBarProps> = ({ count, busy, onCopyImages, onDownload, onShare, onPreview, clipboardQueue, onCopyNext, onClear }) => {
  if (count === 0) return null;
  const single = count === 1;

  return (
    <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 rounded-lg border border-gp-red bg-gp-dark p-3 shadow-[0_12px_45px_rgba(0,0,0,0.7)]" role="toolbar" aria-label="Selected photo actions">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-36">
          <p className="text-sm font-black uppercase text-white">{count} {count === 1 ? 'photo' : 'photos'} selected</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gp-text-muted">
            {clipboardQueue ? `Paste current image, then copy ${clipboardQueue.next} of ${clipboardQueue.total}` : 'Customer image selection'}
          </p>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-2 sm:flex sm:justify-end">
          {clipboardQueue && onCopyNext ? (
            <button disabled={busy} onClick={onCopyNext} className={`${actionClass} bg-gp-red text-white hover:bg-red-700`}>Copy next ({clipboardQueue.next}/{clipboardQueue.total})</button>
          ) : (
            <button disabled={busy} onClick={onCopyImages} className={`${actionClass} bg-gp-red text-white hover:bg-red-700`}>{single ? 'Copy image' : 'Copy images'}</button>
          )}
          {single && onPreview && <button disabled={busy} onClick={onPreview} className={`${actionClass} border border-gp-border bg-gp-input text-white hover:border-white`}>Preview</button>}
          <button disabled={busy} onClick={onDownload} className={`${actionClass} border border-gp-border bg-gp-input text-white hover:border-white`}>{single ? 'Download' : 'Download selected'}</button>
          <button disabled={busy} onClick={onShare} className={`${actionClass} border border-gp-border bg-gp-input text-white hover:border-white`}>{single ? 'Share image' : 'Share images'}</button>
          <button disabled={busy} onClick={onClear} className={`${actionClass} text-gp-text-muted hover:bg-gp-input hover:text-white`}>Clear</button>
        </div>
      </div>
    </div>
  );
};
