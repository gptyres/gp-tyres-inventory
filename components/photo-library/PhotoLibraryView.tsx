import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_PHOTO_FILTERS,
  EMPTY_PHOTO_FACETS,
  fetchPhotos,
  PhotoFilters,
  PhotoRecord,
  PhotoStatus,
  preparePhotoFiles,
  recordPhotoAction,
  updatePhotoStatus
} from '../../photoLibrary';
import { createPhotoZip } from '../../photoZip';
import { pngFilename, shareImageFiles, writeImageBlobsToClipboard, writeOneImageToClipboard } from '../../imageClipboard';
import { nextPhotoFocus, selectPhotoIds, usePhotoSelection } from '../../hooks/usePhotoSelection';
import { PhotoCard } from './PhotoCard';
import { PhotoPreviewModal } from './PhotoPreviewModal';
import { SearchToolbar } from './SearchToolbar';
import { SelectionActionBar } from './SelectionActionBar';

interface PhotoLibraryViewProps {
  isAdmin: boolean;
}

interface DragState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  baseSelection: Set<string>;
  additive: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  photoId: string;
}

const PAGE_SIZE = 60;

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

const imageBlobToPng = async (blob: Blob) => {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image conversion is not available.');
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((png) => (
    png ? resolve(png) : reject(new Error('The image could not be converted for copying.'))
  ), 'image/png'));
};

const safeFetchBlob = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('The selected image could not be loaded.');
  return response.blob();
};

export const PhotoLibraryView: React.FC<PhotoLibraryViewProps> = ({ isAdmin }) => {
  const [filters, setFilters] = useState<PhotoFilters>(DEFAULT_PHOTO_FILTERS);
  const [queryFilters, setQueryFilters] = useState<PhotoFilters>(DEFAULT_PHOTO_FILTERS);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [facets, setFacets] = useState(EMPTY_PHOTO_FACETS);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [clipboardQueue, setClipboardQueue] = useState<File[]>([]);
  const [clipboardQueueIndex, setClipboardQueueIndex] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const liveRegionRef = useRef<HTMLDivElement>(null);
  const visibleIds = useMemo(() => photos.map((photo) => photo.id), [photos]);
  const {
    selectedIds,
    setSelectedIds,
    selectionAnchor,
    focusedIndex,
    setFocusedIndex,
    clickPhoto,
    toggleFocused,
    clearSelection,
    selectAllVisible
  } = usePhotoSelection(visibleIds);
  const selectionKey = useMemo(() => [...selectedIds].sort().join('|'), [selectedIds]);

  useEffect(() => {
    const timer = window.setTimeout(() => setQueryFilters(filters), filters.search === queryFilters.search ? 80 : 350);
    return () => window.clearTimeout(timer);
  }, [filters]);

  useEffect(() => setPage(1), [queryFilters]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void fetchPhotos(queryFilters, page, PAGE_SIZE, controller.signal)
      .then((result) => {
        setPhotos(result.photos);
        setFacets(result.facets);
        setTotal(result.total);
      })
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : 'The photo library could not be loaded.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [queryFilters, page, refreshVersion]);

  useEffect(() => {
    clearSelection();
    setFocusedIndex(photos.length > 0 ? 0 : null);
    setPreviewIndex(null);
  }, [photos]);

  useEffect(() => {
    setClipboardQueue([]);
    setClipboardQueueIndex(0);
  }, [selectionKey]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!dragState) return;
    const handleMove = (event: PointerEvent) => {
      const next = { ...dragState, currentX: event.clientX, currentY: event.clientY };
      setDragState(next);
      const selectionRect = {
        left: Math.min(next.startX, next.currentX),
        right: Math.max(next.startX, next.currentX),
        top: Math.min(next.startY, next.currentY),
        bottom: Math.max(next.startY, next.currentY)
      };
      const selected = next.additive ? new Set(next.baseSelection) : new Set<string>();
      gridRef.current?.querySelectorAll<HTMLElement>('[data-photo-card]').forEach((card) => {
        const rect = card.getBoundingClientRect();
        if (rect.left < selectionRect.right && rect.right > selectionRect.left && rect.top < selectionRect.bottom && rect.bottom > selectionRect.top) {
          const id = card.dataset.photoId;
          if (id) selected.add(id);
        }
      });
      setSelectedIds(selected);
      const scrollContainer = gridRef.current?.closest('main');
      if (event.clientY < 90) scrollContainer?.scrollBy({ top: -18 });
      if (event.clientY > window.innerHeight - 90) scrollContainer?.scrollBy({ top: 18 });
    };
    const handleUp = () => setDragState(null);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [dragState, setSelectedIds]);

  const previewPhoto = previewIndex === null ? null : photos[previewIndex] || null;
  const announce = useCallback((message: string) => {
    if (liveRegionRef.current) liveRegionRef.current.textContent = message;
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    announce(message);
  }, [announce]);

  const focusCard = useCallback((index: number) => {
    setFocusedIndex(index);
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLElement>(`[data-photo-index="${index}"]`)?.focus());
  }, [setFocusedIndex]);

  const handleGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      selectAllVisible();
      showToast(`${photos.length} photos selected on this page.`);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (previewIndex !== null) setPreviewIndex(null);
      else clearSelection();
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      toggleFocused();
      return;
    }
    if (event.key === 'Enter' && focusedIndex !== null) {
      event.preventDefault();
      setPreviewIndex(focusedIndex);
      return;
    }
    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      const styles = gridRef.current ? getComputedStyle(gridRef.current) : null;
      const columns = Math.max(1, styles?.gridTemplateColumns.split(' ').length || 1);
      const next = nextPhotoFocus(focusedIndex, event.key, photos.length, columns);
      if (next !== null) focusCard(next);
    }
  };

  const getSelectedOrPhoto = (photoId?: string) => {
    const ids = [...selectedIds];
    if (photoId && !ids.includes(photoId)) return [photoId];
    return ids;
  };

  const loadSelectedPhotoFiles = async (photoIds: string[]) => {
    const { files } = await preparePhotoFiles(photoIds);
    return Promise.all(files.map(async (file) => ({ file, blob: await safeFetchBlob(file.url) })));
  };

  const beginClipboardCopy = async (files: File[]) => {
    const result = await writeImageBlobsToClipboard(files);
    if (result.copiedAll) {
      setClipboardQueue([]);
      setClipboardQueueIndex(0);
      showToast(`${files.length} ${files.length === 1 ? 'image' : 'images'} copied. Paste into the customer chat.`);
      return;
    }

    setClipboardQueue(files);
    setClipboardQueueIndex(0);
    showToast(`Image 1 of ${files.length} copied. Paste it, then choose Copy next.`);
  };

  const copyImages = async (photoIds = [...selectedIds]) => {
    if (photoIds.length === 0) return;
    setBusy(true);
    try {
      const loaded = await loadSelectedPhotoFiles(photoIds);
      const files = await Promise.all(loaded.map(async ({ file, blob }) => {
        const png = await imageBlobToPng(blob);
        return new File([png], pngFilename(file.filename), { type: 'image/png' });
      }));
      await beginClipboardCopy(files);
      void recordPhotoAction(photoIds, 'photo_copied');
    } catch (copyError) {
      showToast(copyError instanceof Error ? `Copy failed: ${copyError.message}` : 'Copy failed. Use Download instead.');
    } finally {
      setBusy(false);
    }
  };

  const copyNextImage = async () => {
    const nextIndex = clipboardQueueIndex + 1;
    const nextFile = clipboardQueue[nextIndex];
    if (!nextFile) return;
    setBusy(true);
    try {
      await writeOneImageToClipboard(nextFile);
      if (nextIndex >= clipboardQueue.length - 1) {
        setClipboardQueue([]);
        setClipboardQueueIndex(0);
        showToast(`Image ${nextIndex + 1} of ${clipboardQueue.length} copied. The clipboard queue is complete.`);
      } else {
        setClipboardQueueIndex(nextIndex);
        showToast(`Image ${nextIndex + 1} of ${clipboardQueue.length} copied. Paste it, then choose Copy next.`);
      }
    } catch (copyError) {
      showToast(copyError instanceof Error ? `Copy failed: ${copyError.message}` : 'The next image could not be copied.');
    } finally {
      setBusy(false);
    }
  };

  const downloadSelected = async (photoIds = [...selectedIds]) => {
    if (photoIds.length === 0) return;
    setBusy(true);
    try {
      const { files } = await preparePhotoFiles(photoIds);
      if (files.length === 1) {
        triggerDownload(await safeFetchBlob(files[0].url), files[0].filename);
      } else {
        const zipFiles = await Promise.all(files.map(async (file) => ({
          name: file.filename,
          bytes: new Uint8Array(await (await safeFetchBlob(file.url)).arrayBuffer())
        })));
        triggerDownload(createPhotoZip(zipFiles), `GP-Tyres-Customer-Photos-${new Date().toISOString().slice(0, 10)}.zip`);
      }
      void recordPhotoAction(photoIds, 'photo_downloaded');
      showToast(files.length === 1 ? 'Image downloaded.' : 'ZIP download started.');
    } catch (downloadError) {
      showToast(downloadError instanceof Error ? downloadError.message : 'The download could not be prepared.');
    } finally {
      setBusy(false);
    }
  };

  const shareSelected = async () => {
    const photoIds = [...selectedIds];
    if (photoIds.length === 0) return;
    setBusy(true);
    try {
      const loaded = await loadSelectedPhotoFiles(photoIds);
      const shareFiles = loaded.map(({ file, blob }) => new File([blob], file.filename, { type: file.mimeType || blob.type }));
      if (await shareImageFiles(shareFiles, 'GP Tyres & Mags', 'Customer-ready product photos')) {
        void recordPhotoAction(photoIds, 'photo_shared');
        showToast(`${shareFiles.length} ${shareFiles.length === 1 ? 'image' : 'images'} sent to the share menu.`);
        return;
      }

      const clipboardFiles = await Promise.all(loaded.map(async ({ file, blob }) => {
        const png = await imageBlobToPng(blob);
        return new File([png], pngFilename(file.filename), { type: 'image/png' });
      }));
      await beginClipboardCopy(clipboardFiles);
      showToast(`Bulk sharing is unavailable here. Image 1 of ${clipboardFiles.length} is copied; paste it, then choose Copy next.`);
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
      showToast(shareError instanceof Error ? shareError.message : 'The selected images could not be shared.');
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (photoIds: string[], status: PhotoStatus) => {
    setBusy(true);
    try {
      const result = await updatePhotoStatus(photoIds, status);
      showToast(`${result.updated} ${result.updated === 1 ? 'photo' : 'photos'} updated.`);
      setContextMenu(null);
      clearSelection();
      setRefreshVersion((value) => value + 1);
    } catch (statusError) {
      showToast(statusError instanceof Error ? statusError.message : 'Photo status could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  const openContextMenu = (event: React.MouseEvent<HTMLButtonElement>, photo: PhotoRecord, index: number) => {
    event.preventDefault();
    if (!selectedIds.has(photo.id)) {
      setSelectedIds(new Set([photo.id]));
      setFocusedIndex(index);
    }
    setContextMenu({ x: Math.min(event.clientX, window.innerWidth - 220), y: Math.min(event.clientY, window.innerHeight - 330), photoId: photo.id });
  };

  const handleGridPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' || (event.target as HTMLElement).closest('[data-photo-card],button,input,select,a')) return;
    const additive = event.ctrlKey || event.metaKey;
    setDragState({
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      baseSelection: new Set(selectedIds),
      additive
    });
    if (!additive) setSelectedIds(new Set());
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const contextIds = contextMenu ? getSelectedOrPhoto(contextMenu.photoId) : [];
  const contextPhoto = contextMenu ? photos.find((photo) => photo.id === contextMenu.photoId) : undefined;

  return (
    <div className="min-h-full bg-gp-black pb-28 text-gp-text-main">
      <header className="border-b border-gp-border px-4 py-5 lg:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gp-red">Customer Media</p>
            <h1 className="mt-1 text-2xl font-black uppercase text-white sm:text-3xl">Photo Library</h1>
            <p className="mt-1 max-w-2xl text-sm text-gp-text-muted">Select verified tyre and wheel photos, then copy, download or share them with customers.</p>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-gp-text-muted">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Supabase media index
          </div>
        </div>
      </header>

      <SearchToolbar filters={filters} facets={facets} total={total} onChange={setFilters} onReset={() => setFilters(DEFAULT_PHOTO_FILTERS)} />

      {error ? (
        <div className="m-4 rounded-lg border border-gp-red/50 bg-gp-red/10 p-5 lg:m-6">
          <p className="font-black uppercase text-gp-red">Photo library unavailable</p>
          <p className="mt-2 text-sm text-gp-text-muted">{error}</p>
          <button type="button" onClick={() => setRefreshVersion((value) => value + 1)} className="mt-4 rounded bg-gp-red px-4 py-2 text-xs font-black uppercase text-white">Try again</button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 lg:p-6">
          {Array.from({ length: 18 }, (_, index) => <div key={index} className="aspect-[4/3] animate-pulse rounded-lg border border-gp-border bg-gp-panel" />)}
        </div>
      ) : photos.length === 0 ? (
        <div className="mx-auto flex min-h-[45vh] max-w-xl flex-col items-center justify-center px-5 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-gp-border bg-gp-panel text-3xl">□</div>
          <h2 className="mt-4 text-lg font-black uppercase text-white">No matching photos</h2>
          <p className="mt-2 text-sm text-gp-text-muted">Change the filters or show photos that are not customer-ready yet.</p>
          <button type="button" onClick={() => setFilters(DEFAULT_PHOTO_FILTERS)} className="mt-5 rounded bg-gp-red px-4 py-2 text-xs font-black uppercase text-white">Reset filters</button>
        </div>
      ) : (
        <>
          <div
            ref={gridRef}
            role="grid"
            aria-label="Customer photo library"
            aria-multiselectable="true"
            onKeyDown={handleGridKeyDown}
            onPointerDown={handleGridPointerDown}
            className="grid select-none grid-cols-2 gap-3 p-4 outline-none sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 lg:p-6"
          >
            {photos.map((photo, index) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                index={index}
                selected={selectedIds.has(photo.id)}
                focused={focusedIndex === index}
                onClick={(event) => {
                  const modifiers = { toggle: event.ctrlKey || event.metaKey, range: event.shiftKey };
                  const nextSelection = selectPhotoIds(selectedIds, visibleIds, index, selectionAnchor, modifiers);
                  clickPhoto(index, modifiers);
                  announce(`${photo.pattern || photo.description || 'Photo'} selected. ${nextSelection.size} photos selected.`);
                }}
                onDoubleClick={() => setPreviewIndex(index)}
                onContextMenu={(event) => openContextMenu(event, photo, index)}
                onFocus={() => setFocusedIndex(index)}
              />
            ))}
          </div>

          <div className="flex items-center justify-center gap-3 border-t border-gp-border px-4 py-6">
            <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="min-h-10 rounded border border-gp-border bg-gp-input px-4 text-xs font-black uppercase disabled:opacity-30">Previous</button>
            <span className="text-xs font-bold text-gp-text-muted">Page {page} of {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="min-h-10 rounded border border-gp-border bg-gp-input px-4 text-xs font-black uppercase disabled:opacity-30">Next</button>
          </div>
        </>
      )}

      {dragState && (
        <div
          className="pointer-events-none fixed z-50 border border-blue-400 bg-blue-500/20"
          style={{
            left: Math.min(dragState.startX, dragState.currentX),
            top: Math.min(dragState.startY, dragState.currentY),
            width: Math.abs(dragState.currentX - dragState.startX),
            height: Math.abs(dragState.currentY - dragState.startY)
          }}
        />
      )}

      {contextMenu && contextPhoto && (
        <div className="fixed z-[60] w-52 overflow-hidden rounded-lg border border-gp-border bg-gp-dark p-1 shadow-2xl" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu" onClick={(event) => event.stopPropagation()}>
          <button role="menuitem" onClick={() => { setPreviewIndex(photos.findIndex((photo) => photo.id === contextPhoto.id)); setContextMenu(null); }} className="block w-full rounded px-3 py-2 text-left text-xs font-bold text-white hover:bg-gp-input">Preview</button>
          <button role="menuitem" onClick={() => { void copyImages(contextIds); setContextMenu(null); }} className="block w-full rounded px-3 py-2 text-left text-xs font-bold text-white hover:bg-gp-input">{contextIds.length > 1 ? 'Copy selected images' : 'Copy image'}</button>
          <button role="menuitem" onClick={() => { void downloadSelected(contextIds); setContextMenu(null); }} className="block w-full rounded px-3 py-2 text-left text-xs font-bold text-white hover:bg-gp-input">{contextIds.length > 1 ? 'Download selected' : 'Download image'}</button>
          {isAdmin && (
            <>
              <div className="my-1 border-t border-gp-border" />
              <button role="menuitem" onClick={() => void changeStatus(contextIds, 'customer_ready')} className="block w-full rounded px-3 py-2 text-left text-xs font-bold text-emerald-400 hover:bg-gp-input">Mark customer-ready</button>
              <button role="menuitem" onClick={() => void changeStatus(contextIds, 'review_required')} className="block w-full rounded px-3 py-2 text-left text-xs font-bold text-amber-400 hover:bg-gp-input">Needs review</button>
              <button role="menuitem" onClick={() => void changeStatus(contextIds, 'rejected')} className="block w-full rounded px-3 py-2 text-left text-xs font-bold text-gp-red hover:bg-gp-input">Reject photo</button>
            </>
          )}
          <div className="my-1 border-t border-gp-border" />
          <button role="menuitem" onClick={() => { clearSelection(); setContextMenu(null); }} className="block w-full rounded px-3 py-2 text-left text-xs font-bold text-gp-text-muted hover:bg-gp-input hover:text-white">Clear selection</button>
        </div>
      )}

      <SelectionActionBar
        count={selectedIds.size}
        busy={busy}
        onCopyImages={() => void copyImages()}
        onDownload={() => void downloadSelected()}
        onShare={() => void shareSelected()}
        onPreview={() => setPreviewIndex(photos.findIndex((photo) => selectedIds.has(photo.id)))}
        clipboardQueue={clipboardQueue.length > 1 ? { next: clipboardQueueIndex + 2, total: clipboardQueue.length } : null}
        onCopyNext={() => void copyNextImage()}
        onClear={() => { clearSelection(); showToast('Selection cleared.'); }}
      />

      <PhotoPreviewModal
        photo={previewPhoto}
        hasPrevious={previewIndex !== null && previewIndex > 0}
        hasNext={previewIndex !== null && previewIndex < photos.length - 1}
        onClose={() => setPreviewIndex(null)}
        onPrevious={() => setPreviewIndex((value) => value === null ? null : Math.max(0, value - 1))}
        onNext={() => setPreviewIndex((value) => value === null ? null : Math.min(photos.length - 1, value + 1))}
        onCopy={() => { if (previewPhoto) void copyImages([previewPhoto.id]); }}
        onDownload={() => { if (previewPhoto) void downloadSelected([previewPhoto.id]); }}
      />

      {toast && <div className="fixed right-4 top-20 z-[80] max-w-sm rounded-lg border border-gp-border bg-gp-dark px-4 py-3 text-sm font-bold text-white shadow-2xl">{toast}</div>}
      <div ref={liveRegionRef} className="sr-only" aria-live="polite" aria-atomic="true" />
    </div>
  );
};
