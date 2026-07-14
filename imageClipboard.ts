export interface ImageClipboardResult {
  copiedAll: boolean;
  copiedCount: number;
  total: number;
}

interface ClipboardItemLike {
  readonly types?: readonly string[];
}

interface ImageClipboardAdapter {
  write: (items: ClipboardItem[]) => Promise<void>;
  read?: () => Promise<ClipboardItemLike[]>;
}

type ClipboardItemFactory = new (items: Record<string, Blob>) => ClipboardItem;

const browserClipboard = () => navigator.clipboard as ImageClipboardAdapter | undefined;
const browserClipboardItem = () => (window as typeof window & { ClipboardItem?: ClipboardItemFactory }).ClipboardItem;

export const writeImageBlobsToClipboard = async (
  blobs: Blob[],
  clipboard: ImageClipboardAdapter | undefined = browserClipboard(),
  ClipboardItemCtor: ClipboardItemFactory | undefined = browserClipboardItem()
): Promise<ImageClipboardResult> => {
  if (blobs.length === 0) return { copiedAll: true, copiedCount: 0, total: 0 };
  if (!clipboard?.write || !ClipboardItemCtor) throw new Error('Image clipboard is not available in this browser.');

  const items = blobs.map((blob) => new ClipboardItemCtor({ [blob.type || 'image/png']: blob }));
  let submittedAll = false;

  try {
    await clipboard.write(items);
    submittedAll = true;
    if (items.length === 1) return { copiedAll: true, copiedCount: 1, total: 1 };

    if (clipboard.read) {
      try {
        const writtenItems = await clipboard.read();
        if (writtenItems.length >= items.length) {
          return { copiedAll: true, copiedCount: items.length, total: items.length };
        }
      } catch {
        // Reading may require a separate permission. Use the reliable queue fallback.
      }
    }
  } catch {
    submittedAll = false;
  }

  if (!submittedAll || items.length > 1) await clipboard.write([items[0]]);
  return { copiedAll: false, copiedCount: 1, total: items.length };
};

export const writeOneImageToClipboard = async (
  blob: Blob,
  clipboard: ImageClipboardAdapter | undefined = browserClipboard(),
  ClipboardItemCtor: ClipboardItemFactory | undefined = browserClipboardItem()
) => {
  const result = await writeImageBlobsToClipboard([blob], clipboard, ClipboardItemCtor);
  return result.copiedCount === 1;
};

export const shareImageFiles = async (
  files: File[],
  title: string,
  text: string,
  shareNavigator: Pick<Navigator, 'share' | 'canShare'> = navigator
) => {
  if (!files.length || !shareNavigator.share || !shareNavigator.canShare?.({ files })) return false;
  await shareNavigator.share({ title, text, files });
  return true;
};

export const pngFilename = (filename: string) => {
  const withoutExtension = filename.replace(/\.[a-z0-9]{2,5}$/i, '');
  return `${withoutExtension || 'customer-image'}.png`;
};
