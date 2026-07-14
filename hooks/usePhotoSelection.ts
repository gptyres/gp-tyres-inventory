import { useCallback, useState } from 'react';

export interface PhotoSelectionModifiers {
  toggle: boolean;
  range: boolean;
}

export const selectPhotoIds = (
  current: Set<string>,
  visibleIds: string[],
  index: number,
  anchor: number | null,
  modifiers: PhotoSelectionModifiers
) => {
  const photoId = visibleIds[index];
  if (!photoId) return new Set(current);

  if (modifiers.range && anchor !== null) {
    const start = Math.min(anchor, index);
    const end = Math.max(anchor, index);
    const next = modifiers.toggle ? new Set(current) : new Set<string>();
    visibleIds.slice(start, end + 1).forEach((id) => next.add(id));
    return next;
  }

  if (modifiers.toggle) {
    const next = new Set(current);
    if (next.has(photoId)) next.delete(photoId);
    else next.add(photoId);
    return next;
  }

  return new Set([photoId]);
};

export const nextPhotoFocus = (current: number | null, key: string, count: number, columns: number) => {
  if (count === 0) return null;
  const index = current === null ? 0 : current;
  if (key === 'ArrowLeft') return Math.max(0, index - 1);
  if (key === 'ArrowRight') return Math.min(count - 1, index + 1);
  if (key === 'ArrowUp') return Math.max(0, index - columns);
  if (key === 'ArrowDown') return Math.min(count - 1, index + columns);
  return index;
};

export const usePhotoSelection = (visibleIds: string[]) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const clickPhoto = useCallback((index: number, modifiers: PhotoSelectionModifiers) => {
    setSelectedIds((current) => selectPhotoIds(current, visibleIds, index, selectionAnchor, modifiers));
    if (!modifiers.range) setSelectionAnchor(index);
    setFocusedIndex(index);
  }, [selectionAnchor, visibleIds]);

  const toggleFocused = useCallback(() => {
    if (focusedIndex === null) return;
    const id = visibleIds[focusedIndex];
    if (!id) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectionAnchor(focusedIndex);
  }, [focusedIndex, visibleIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionAnchor(null);
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(visibleIds));
    setSelectionAnchor(visibleIds.length > 0 ? 0 : null);
  }, [visibleIds]);

  return {
    selectedIds,
    setSelectedIds,
    selectionAnchor,
    focusedIndex,
    setFocusedIndex,
    clickPhoto,
    toggleFocused,
    clearSelection,
    selectAllVisible
  };
};

