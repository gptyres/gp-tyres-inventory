import { describe, expect, it, vi } from 'vitest';
import { optimizeImageUpload } from './imageUploadOptimization';

describe('image upload optimisation', () => {
  const original = { type: 'image/jpeg', size: 500000, name: 'wheel.jpg' } as File;

  it('uses a smaller same-format result and retains file metadata', async () => {
    const result = { type: 'image/jpeg', size: 200000, name: 'wheel.jpg' } as File;
    const encode = vi.fn().mockResolvedValue(result);
    expect(await optimizeImageUpload(original, encode)).toBe(result);
    expect(encode).toHaveBeenCalledWith(original);
  });

  it('keeps the original when encoding fails, grows the file, or changes its format', async () => {
    expect(await optimizeImageUpload(original, async () => { throw new Error('decode'); })).toBe(original);
    expect(await optimizeImageUpload(original, async () => ({ ...original, size: 600000 }) as File)).toBe(original);
    expect(await optimizeImageUpload(original, async () => ({ ...original, type: 'image/png', size: 100 }) as File)).toBe(original);
  });

  it('does not flatten animated or unsupported formats', async () => {
    const encode = vi.fn();
    const gif = { type: 'image/gif', size: 900000, name: 'animated.gif' } as File;
    const webp = { type: 'image/webp', size: 900000, name: 'image.webp' } as File;
    expect(await optimizeImageUpload(gif, encode)).toBe(gif);
    expect(await optimizeImageUpload(webp, encode)).toBe(webp);
    expect(encode).not.toHaveBeenCalled();
  });
});
