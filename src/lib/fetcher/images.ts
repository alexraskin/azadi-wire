import {
  IMAGE_CACHE_CONTROL,
  MAX_IMAGE_BYTES,
  imageKey,
  imagePath,
  isAllowedImageType,
} from '../images';

/**
 * Copies article thumbnails into R2 so pages can serve them from
 * cdn.azadiwire.org instead of hotlinking the publisher. Runs inside the
 * fetcher cron: the CDN domain sits directly in front of the bucket, so
 * nothing can fill an object on demand at request time.
 */

/** Bucket surface we depend on, so tests can pass a stub. */
export interface ImageBucket {
  head(key: string): Promise<unknown | null>;
  put(key: string, value: ArrayBuffer, options?: unknown): Promise<unknown>;
  delete(keys: string | string[]): Promise<void>;
}

/** Ceiling on images pulled per run, to bound the fetcher's subrequests. */
export const MAX_FILLS_PER_RUN = 60;

/** Source fetches in flight at once. */
export const FILL_CONCURRENCY = 6;

/** Give up on a slow publisher rather than stall the run. */
const FETCH_TIMEOUT_MS = 8000;

/** R2 caps a single delete call at 1000 keys. */
const DELETE_CHUNK = 1000;

/**
 * Fetch one image into the bucket and return its key, or null if it could not
 * be stored. A null key leaves the article hotlinking the source, which is the
 * behaviour that predates this cache, so failures need no retry bookkeeping.
 */
export async function storeImage(
  bucket: ImageBucket,
  sourceUrl: string
): Promise<string | null> {
  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

    const key = await imageKey(sourceUrl);
    const path = imagePath(key);

    // Already stored, by an earlier run or by another article sharing the image.
    if (await bucket.head(path)) return key;

    const response = await fetch(sourceUrl, {
      headers: { 'User-Agent': 'AzadiWire/1.0' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const contentType = response.headers.get('content-type');
    if (!isAllowedImageType(contentType)) return null;

    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) return null;

    // Content-Length is a claim, not a guarantee; check what actually arrived.
    const body = await response.arrayBuffer();
    if (body.byteLength === 0 || body.byteLength > MAX_IMAGE_BYTES) return null;

    await bucket.put(path, body, {
      httpMetadata: {
        // A custom domain serves both of these from the object's own metadata.
        contentType: contentType!.split(';')[0].trim().toLowerCase(),
        cacheControl: IMAGE_CACHE_CONTROL,
      },
    });

    return key;
  } catch {
    return null;
  }
}

export interface StoreImagesResult {
  /** Source URLs that ended up in the bucket, mapped to their keys. */
  keys: Map<string, string>;
  /** Distinct URLs tried, successful or not. This is what spends the budget. */
  attempted: number;
}

/**
 * Store a batch of thumbnails, capped and with bounded concurrency. A URL
 * absent from `keys` was not stored, so its article keeps hotlinking.
 */
export async function storeImages(
  bucket: ImageBucket | undefined | null,
  urls: (string | null)[],
  opts: { limit?: number; concurrency?: number } = {}
): Promise<StoreImagesResult> {
  const keys = new Map<string, string>();
  if (!bucket) return { keys, attempted: 0 };

  const limit = Math.max(0, opts.limit ?? MAX_FILLS_PER_RUN);
  const concurrency = Math.max(1, opts.concurrency ?? FILL_CONCURRENCY);

  // One fetch per distinct URL, even when several articles carry the same image.
  const pending = [...new Set(urls.filter((u): u is string => !!u))].slice(0, limit);

  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
    while (next < pending.length) {
      const url = pending[next++];
      const key = await storeImage(bucket, url);
      if (key) keys.set(url, key);
    }
  });
  await Promise.all(workers);

  return { keys, attempted: pending.length };
}

/**
 * Drop stored images whose articles have aged out. A key shared with an
 * article still in the table is dropped too; that article falls back to the
 * publisher's URL, which is the pre-cache behaviour.
 */
export async function deleteImages(
  bucket: ImageBucket | undefined | null,
  keys: string[]
): Promise<void> {
  if (!bucket || keys.length === 0) return;
  const paths = keys.map(imagePath);
  for (let i = 0; i < paths.length; i += DELETE_CHUNK) {
    await bucket.delete(paths.slice(i, i + DELETE_CHUNK));
  }
}
