import { describe, expect, it } from 'vitest';
import { nextPhotoFocus, selectPhotoIds } from './hooks/usePhotoSelection';
import { createPhotoZip } from './photoZip';
import { buildCustomerPhotoFilename, sanitizePhotoIds } from './server/photoLibrary';
import { pngFilename, shareImageFiles, writeImageBlobsToClipboard } from './imageClipboard';

describe('photo library selection', () => {
  const ids = ['one', 'two', 'three', 'four', 'five'];

  it('selects one photo on an ordinary click', () => {
    expect([...selectPhotoIds(new Set(['five']), ids, 1, null, { toggle: false, range: false })]).toEqual(['two']);
  });

  it('toggles one photo with Ctrl or Cmd click', () => {
    expect([...selectPhotoIds(new Set(['one', 'two']), ids, 1, 0, { toggle: true, range: false })]).toEqual(['one']);
  });

  it('selects a visible range in current order with Shift click', () => {
    expect([...selectPhotoIds(new Set(), ids, 3, 1, { toggle: false, range: true })]).toEqual(['two', 'three', 'four']);
  });

  it('moves focus by the active grid column count', () => {
    expect(nextPhotoFocus(5, 'ArrowDown', 20, 4)).toBe(9);
    expect(nextPhotoFocus(5, 'ArrowUp', 20, 4)).toBe(1);
    expect(nextPhotoFocus(0, 'ArrowLeft', 20, 4)).toBe(0);
  });
});

describe('photo download helpers', () => {
  it('creates customer-friendly filenames', () => {
    expect(buildCustomerPhotoFilename({
      brand: 'Radar',
      pattern: 'Renegade RT+',
      tyre_size: '265/65R17',
      mime_type: 'image/jpeg'
    })).toBe('Radar-Renegade-RT-265-65R17.jpg');
  });

  it('rejects malformed IDs and applies the batch limit', () => {
    const valid = '4eb0d021-0000-4000-8000-000000000000';
    expect(sanitizePhotoIds([valid, 'not-an-id', valid], 30)).toEqual([valid]);
  });

  it('builds a valid store-mode ZIP archive', async () => {
    const zip = createPhotoZip([
      { name: 'one.txt', bytes: new TextEncoder().encode('first') },
      { name: 'two.txt', bytes: new TextEncoder().encode('second') }
    ]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(0x04034b50);
    expect(new DataView(bytes.buffer).getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  });
});

describe('customer image clipboard and sharing', () => {
  class TestClipboardItem {
    constructor(public values: Record<string, Blob>) {}
  }

  it('writes separate clipboard items when the platform confirms multi-item support', async () => {
    const writes: unknown[][] = [];
    const clipboard = {
      write: async (items: unknown[]) => { writes.push(items); },
      read: async () => [{ types: ['image/png'] }, { types: ['image/png'] }]
    };
    const result = await writeImageBlobsToClipboard(
      [new Blob(['one'], { type: 'image/png' }), new Blob(['two'], { type: 'image/png' })],
      clipboard as never,
      TestClipboardItem as never
    );

    expect(result).toEqual({ copiedAll: true, copiedCount: 2, total: 2 });
    expect(writes.map((items) => items.length)).toEqual([2]);
  });

  it('keeps the first real image on the clipboard when the platform only supports one item', async () => {
    const writes: unknown[][] = [];
    const clipboard = {
      write: async (items: unknown[]) => { writes.push(items); },
      read: async () => [{ types: ['image/png'] }]
    };
    const result = await writeImageBlobsToClipboard(
      [new Blob(['one'], { type: 'image/png' }), new Blob(['two'], { type: 'image/png' })],
      clipboard as never,
      TestClipboardItem as never
    );

    expect(result).toEqual({ copiedAll: false, copiedCount: 1, total: 2 });
    expect(writes.map((items) => items.length)).toEqual([2, 1]);
  });

  it('shares selected images as separate files and keeps customer filenames tidy', async () => {
    const shared: ShareData[] = [];
    const files = [new File(['one'], 'wheel-one.png', { type: 'image/png' }), new File(['two'], 'wheel-two.png', { type: 'image/png' })];
    const supported = await shareImageFiles(files, 'GP Tyres', 'Wheel options', {
      canShare: (data) => data.files?.length === 2,
      share: async (data) => { shared.push(data); }
    } as Navigator);

    expect(supported).toBe(true);
    expect(shared[0].files).toEqual(files);
    expect(pngFilename('customer.photo.webp')).toBe('customer.photo.png');
  });
});
