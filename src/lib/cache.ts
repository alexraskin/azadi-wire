/**
 * Caching policy. The fetcher only writes new articles every 15 minutes
 * (see the cron trigger in wrangler.jsonc), so anything derived from the
 * articles table can safely be served from cache for that long.
 */

export const CACHE_TTL = 900; // 15 minutes, matches the fetcher cron interval

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
  '/unsubscribe',
];

export function isCacheablePath(pathname: string): boolean {
  return !UNCACHEABLE.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export const CACHE_VERSION_PARAM = '__cv';

/** How long an isolate reuses a looked-up content version before re-reading D1. */
export const VERSION_TTL_MS = 30_000;

/**
 * Cache entries are keyed by request URL plus a content version, so a fetcher
 * run that inserted articles orphans every previous entry immediately (the
 * orphans fall out on their own TTL).
 */
export function cacheKeyUrl(url: string, version: string): string {
  const keyed = new URL(url);
  keyed.searchParams.set(CACHE_VERSION_PARAM, version);
  return keyed.toString();
}

/** True if the response is safe to store in the edge cache. */
export function isCacheableResponse(response: Response): boolean {
  if (response.status !== 200) return false;
  if (response.headers.has('set-cookie')) return false;
  const cc = response.headers.get('cache-control')?.toLowerCase() ?? '';
  return !cc.includes('no-store') && !cc.includes('private');
}
