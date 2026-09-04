/**
 * Caching policy. The fetcher only writes new articles every 15 minutes
 * (see the cron trigger in wrangler.jsonc), so anything derived from the
 * articles table can safely be served from cache for that long.
 *
 * Entries are stored in the Workers Cache API by the middleware. Cloudflare
 * does not honour `stale-while-revalidate` for worker-generated responses, so
 * freshness is tracked on the entry itself: the stored copy carries the
 * content version it was rendered from and the instant it stops being fresh.
 * A request that finds an expired or out-of-version entry is served the stale
 * copy immediately while the page re-renders behind it.
 */

/** Article-derived pages and APIs. Matches the fetcher cron interval. */
export const CACHE_TTL = 900;

/** A stored article never changes after insert, so its page holds for a day. */
export const ARTICLE_TTL = 86_400;

/** Digest pages are fixed once generated; the sidebar list turns over daily. */
export const DIGEST_TTL = 3_600;

/** Pages that render no database content. */
export const STATIC_TTL = 86_400;

/** Negative caching, so crawlers hitting dead slugs do not reach D1. */
export const NOT_FOUND_TTL = 60;

/** How long past its TTL an entry may still be served while it re-renders. */
export const MAX_STALE = 86_400;

/** How long an isolate reuses a looked-up content version before re-reading D1. */
export const VERSION_TTL_MS = 30_000;

/** Cache-Control for JSON/XML responses: cacheable by browsers and the edge. */
export function cacheControl(ttl: number = CACHE_TTL): string {
  return `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=${ttl}`;
}

/**
 * Cache-Control for SSR HTML: the edge holds the page for the full interval,
 * but browsers revalidate so a reload always reflects the current edge copy.
 */
export function htmlCacheControl(ttl: number = CACHE_TTL): string {
  return `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${ttl}`;
}

export const NO_STORE = 'private, no-store';

/** Paths that must never be served from cache. */
const UNCACHEABLE = [
  '/api/cron',
  '/api/status',
  '/api/subscribe',
  '/api/unsubscribe',
  '/subscribe',
  '/unsubscribe',
];

export function isCacheablePath(pathname: string): boolean {
  return !UNCACHEABLE.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Pages whose output does not depend on the database. */
const STATIC_PAGES = new Set(['/about', '/terms', '/rss', '/bookmarks', '/404']);

export interface CacheProfile {
  /** Seconds the entry stays fresh. */
  ttl: number;
  /**
   * Whether a fetcher run that inserted articles invalidates the entry.
   * Immutable content (an article page, a past digest) does not need it and
   * keeps serving through the run.
   */
  versioned: boolean;
}

/** Cache settings for a path, or null when the path must not be cached. */
export function cacheProfile(pathname: string): CacheProfile | null {
  if (!isCacheablePath(pathname)) return null;
  if (STATIC_PAGES.has(pathname)) return { ttl: STATIC_TTL, versioned: false };
  if (pathname.startsWith('/article/') || pathname.startsWith('/api/articles/')) {
    return { ttl: ARTICLE_TTL, versioned: false };
  }
  if (pathname.startsWith('/digest/')) return { ttl: DIGEST_TTL, versioned: false };
  return { ttl: CACHE_TTL, versioned: true };
}

/** TTL to store a response under, given its status and the path profile. */
export function ttlFor(status: number, profile: CacheProfile): number {
  return status === 404 ? NOT_FOUND_TTL : profile.ttl;
}

/**
 * Query params that change what a page renders. Everything else (ad trackers,
 * link decorations, cache-buster junk) is dropped from the key so those
 * requests share one entry instead of each rendering their own.
 */
const KEY_PARAMS = ['channel', 'limit', 'page', 'q', 'source', 'topic'];

/**
 * Cache key for a request URL: the origin and path, plus the params that
 * affect output, in a fixed order.
 */
export function normalizeCacheKey(url: string): string {
  const source = new URL(url);
  const key = new URL(source.origin + source.pathname);
  for (const name of KEY_PARAMS) {
    const value = source.searchParams.get(name);
    if (value !== null && value !== '') key.searchParams.set(name, value);
  }
  return key.toString();
}

/** Internal headers carried by a stored entry; stripped before it is served. */
export const HEADER_FRESH_UNTIL = 'x-cache-fresh-until';
export const HEADER_VERSION = 'x-cache-version';
export const HEADER_STORED_AT = 'x-cache-stored-at';
export const HEADER_CLIENT_CONTROL = 'x-cache-client-control';

const INTERNAL_HEADERS = [
  HEADER_FRESH_UNTIL,
  HEADER_VERSION,
  HEADER_STORED_AT,
  HEADER_CLIENT_CONTROL,
];

/** True if the response is safe to store in the edge cache. */
export function isCacheableResponse(response: Response): boolean {
  if (response.status !== 200 && response.status !== 404) return false;
  if (response.headers.has('set-cookie')) return false;
  const cc = response.headers.get('cache-control')?.toLowerCase() ?? '';
  return !cc.includes('no-store') && !cc.includes('private');
}

/**
 * Copy of a response to hand to cache.put(). The stored Cache-Control covers
 * the fresh window plus the stale window, so the entry survives long enough to
 * be served while it re-renders; the client-facing value rides along in a
 * private header and is restored on the way out.
 */
export function prepareForStore(
  response: Response,
  opts: { version: string | null; ttl: number; now?: number }
): Response {
  const now = opts.now ?? Date.now();
  const headers = new Headers(response.headers);
  const clientControl = headers.get('cache-control');
  if (clientControl) headers.set(HEADER_CLIENT_CONTROL, clientControl);
  headers.set(HEADER_FRESH_UNTIL, String(now + opts.ttl * 1000));
  headers.set(HEADER_STORED_AT, String(now));
  headers.set(HEADER_VERSION, opts.version ?? 'none');
  headers.set('Cache-Control', `public, s-maxage=${opts.ttl + MAX_STALE}`);

  return new Response(response.clone().body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export type EntryState = 'fresh' | 'stale';

/**
 * Whether a stored entry can be served as-is. An entry rendered before the
 * current fetcher run, or past its TTL, is stale: still servable, but it
 * triggers a re-render behind the response.
 */
export function entryState(
  stored: Response,
  version: string | null,
  now: number = Date.now()
): EntryState {
  if (version !== null && stored.headers.get(HEADER_VERSION) !== version) return 'stale';
  const freshUntil = Number(stored.headers.get(HEADER_FRESH_UNTIL));
  if (!Number.isFinite(freshUntil) || now >= freshUntil) return 'stale';
  return 'fresh';
}

/**
 * Response to send a client from a stored entry: internal headers removed, the
 * original Cache-Control restored, and Age set so browsers and any downstream
 * cache measure the remaining lifetime from when the entry was rendered rather
 * than from now.
 */
export function fromStored(
  stored: Response,
  state: EntryState,
  now: number = Date.now()
): Response {
  const headers = new Headers(stored.headers);
  const clientControl = headers.get(HEADER_CLIENT_CONTROL);
  const storedAt = Number(headers.get(HEADER_STORED_AT));

  for (const name of INTERNAL_HEADERS) headers.delete(name);
  if (clientControl) headers.set('Cache-Control', clientControl);
  if (Number.isFinite(storedAt)) {
    headers.set('Age', String(Math.max(0, Math.floor((now - storedAt) / 1000))));
  }
  headers.set('X-Cache', state === 'fresh' ? 'HIT' : 'STALE');

  return new Response(stored.body, {
    status: stored.status,
    statusText: stored.statusText,
    headers,
  });
}
