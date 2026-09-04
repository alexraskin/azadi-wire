import { describe, it, expect } from 'vitest';
import {
  ALLOWED_IMAGE_TYPES,
  CDN_URL,
  IMAGE_CACHE_CONTROL,
  MAX_IMAGE_BYTES,
  imageKey,
  imagePath,
  imageUrl,
  isAllowedImageType,
  isValidImageKey,
} from './images';

describe('imageKey', () => {
  it('is a 32-character hex digest', async () => {
    const key = await imageKey('https://example.com/photo.jpg');
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is stable for the same url', async () => {
    const a = await imageKey('https://example.com/photo.jpg');
    const b = await imageKey('https://example.com/photo.jpg');
    expect(a).toBe(b);
  });

  it('differs between urls', async () => {
    const a = await imageKey('https://example.com/a.jpg');
    const b = await imageKey('https://example.com/b.jpg');
    expect(a).not.toBe(b);
  });
});

describe('imagePath', () => {
  it('namespaces objects under thumbs/', () => {
    expect(imagePath('abc')).toBe('thumbs/abc');
  });
});

describe('isValidImageKey', () => {
  it('accepts a 32-character lowercase hex key', () => {
    expect(isValidImageKey('0123456789abcdef0123456789abcdef')).toBe(true);
  });

  it('rejects wrong length, uppercase, and non-hex', () => {
    expect(isValidImageKey('0123456789abcdef')).toBe(false);
    expect(isValidImageKey('0123456789ABCDEF0123456789ABCDEF')).toBe(false);
    expect(isValidImageKey('../../etc/passwd')).toBe(false);
    expect(isValidImageKey('')).toBe(false);
  });
});

describe('isAllowedImageType', () => {
  it('accepts the raster types we re-serve', () => {
    for (const type of ALLOWED_IMAGE_TYPES) {
      expect(isAllowedImageType(type)).toBe(true);
    }
  });

  it('ignores charset parameters and casing', () => {
    expect(isAllowedImageType('IMAGE/JPEG; charset=binary')).toBe(true);
  });

  it('rejects svg, which would run script on our own hostname', () => {
    expect(isAllowedImageType('image/svg+xml')).toBe(false);
  });

  it('rejects non-images and a missing header', () => {
    expect(isAllowedImageType('text/html')).toBe(false);
    expect(isAllowedImageType(null)).toBe(false);
  });
});

describe('imageUrl', () => {
  const key = '0123456789abcdef0123456789abcdef';

  it('points at the cdn when the image is stored', () => {
    expect(imageUrl({ image_key: key, thumbnail_url: 'https://src.example/a.jpg' })).toBe(
      `${CDN_URL}/thumbs/${key}`
    );
  });

  it('is absolute, so feeds and og tags can use it unchanged', () => {
    expect(imageUrl({ image_key: key, thumbnail_url: null })!.startsWith('https://')).toBe(true);
  });

  it('falls back to the publisher url when nothing was stored', () => {
    expect(imageUrl({ image_key: null, thumbnail_url: 'https://src.example/a.jpg' })).toBe(
      'https://src.example/a.jpg'
    );
  });

  it('handles rows predating the image_key column', () => {
    expect(imageUrl({ thumbnail_url: 'https://src.example/a.jpg' })).toBe(
      'https://src.example/a.jpg'
    );
  });

  it('is null when there is no image at all', () => {
    expect(imageUrl({ image_key: null, thumbnail_url: null })).toBeNull();
  });
});

describe('constants', () => {
  it('caps stored images at 5MB', () => {
    expect(MAX_IMAGE_BYTES).toBe(5 * 1024 * 1024);
  });

  it('stores a long immutable cache-control, since the cdn serves it from metadata', () => {
    expect(IMAGE_CACHE_CONTROL).toContain('immutable');
  });
});
