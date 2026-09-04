/**
 * Article thumbnails are copied into R2 (bucket azadi-wire-cdn) and served
 * from cdn.azadiwire.org, a public custom domain pointed straight at the
 * bucket. Nothing runs on the read path, so an object either exists or the
 * image 404s: the fetcher stores images eagerly and only writes `image_key`
 * once the object is confirmed in the bucket. A row without a key falls back
 * to the publisher's own URL.
 */

/** Public custom domain in front of the R2 bucket. */
export const CDN_URL = 'https://cdn.azadiwire.org';

/** Object prefix, leaving the bucket root free for other asset types. */
export const IMAGE_PREFIX = 'thumbs/';

/**
 * Content types we are willing to store and re-serve. Raster only: an SVG is
 * a document, and one written by a source we do not control would execute
 * script on a hostname inside our own zone.
 */
export const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

/** Largest image we will pull into the bucket. */
export const MAX_IMAGE_BYTES = 5_242_880;

/**
 * Stored on the object: R2 custom domains serve Cache-Control from the
 * object's own metadata, so this is the only place it can be set. The key is
 * derived from the source URL, which is stable for the life of the article.
 */
export const IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Length of the hex key kept from the digest. */
const KEY_LENGTH = 32;

/**
 * Object key for a source image URL. Deterministic, so two articles carrying
 * the same image share one object and a re-fetch of the same URL is a no-op.
 */
export async function imageKey(url: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, KEY_LENGTH);
}

/** Full object path in the bucket for a key. */
export function imagePath(key: string): string {
  return `${IMAGE_PREFIX}${key}`;
}

export function isValidImageKey(key: string): boolean {
  return new RegExp(`^[0-9a-f]{${KEY_LENGTH}}$`).test(key);
}

/** Content type usable as-is, ignoring any charset parameter. */
export function isAllowedImageType(contentType: string | null): boolean {
  if (!contentType) return false;
  return ALLOWED_IMAGE_TYPES.has(contentType.split(';')[0].trim().toLowerCase());
}

/**
 * Where to point an <img> or a feed enclosure: the CDN copy when we have one,
 * the publisher's URL when we do not. Always absolute, so feed items and
 * OpenGraph tags can use it unchanged.
 */
export function imageUrl(item: {
  image_key?: string | null;
  thumbnail_url?: string | null;
}): string | null {
  if (item.image_key) return `${CDN_URL}/${imagePath(item.image_key)}`;
  return item.thumbnail_url || null;
}
