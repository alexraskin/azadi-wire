import { defineMiddleware } from 'astro:middleware';
import {
  CACHE_TTL,
  VERSION_TTL_MS,
  cacheKeyUrl,
  htmlCacheControl,
  isCacheablePath,
  isCacheableResponse,
} from './lib/cache';
import { getContentVersion, getReadDB } from './lib/db';

const ALLOWED_ORIGINS = [
  'https://azadiwire.org',
  'https://www.azadiwire.org',
];

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'X-XSS-Protection': '0',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
};

function isAllowedOrigin(origin: string | null, requestUrl: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;

  const url = new URL(requestUrl);
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    return origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
  }

  return false;
}

/**
 * Worker-generated responses are not stored in Cloudflare's edge cache
 * automatically, so we do it explicitly with the Cache API. Cache-Control
 * headers on the stored response decide its TTL.
 */
function edgeCache(): Cache | null {
  if (typeof caches === 'undefined') return null;
  return (caches as any).default ?? null;
}

// Per-isolate memo so the version lookup costs at most one D1 read per
// VERSION_TTL_MS, not one per request.
let versionCache: { value: string; expires: number } | null = null;

async function contentVersion(env: any): Promise<string> {
  const now = Date.now();
  if (versionCache && versionCache.expires > now) return versionCache.value;

  let value = 'none';
  try {
    value = (await getContentVersion(getReadDB(env))) ?? 'none';
  } catch {
    // D1 unavailable: fall back to a time bucket so caching still works.
    value = `t${Math.floor(now / (CACHE_TTL * 1000))}`;
  }

  versionCache = { value, expires: now + VERSION_TTL_MS };
  return value;
}

export const onRequest = defineMiddleware(async ({ request, url, locals }, next) => {
  if (request.method === 'POST') {
    const origin = request.headers.get('origin');

    // One-click unsubscribe from email clients sends POST without origin
    const isUnsubscribe = url.pathname === '/api/unsubscribe';

    if (!isUnsubscribe) {
      if (!origin || !isAllowedOrigin(origin, request.url)) {
        return new Response('Forbidden', { status: 403 });
      }
    }
  }

  const cacheable =
    request.method === 'GET' &&
    !request.headers.has('authorization') &&
    isCacheablePath(url.pathname);

  const cache = cacheable ? edgeCache() : null;
  let cacheKey: Request | null = null;
  let version: string | null = null;

  if (cache) {
    version = await contentVersion((locals as any).runtime?.env);
    cacheKey = new Request(cacheKeyUrl(url.toString(), version), { method: 'GET' });

    const hit = await cache.match(cacheKey);
    if (hit) {
      const headers = new Headers(hit.headers);
      headers.set('X-Cache', 'HIT');
      headers.set('X-Cache-Version', version);
      return new Response(hit.body, { status: hit.status, headers });
    }
  }

  const response = await next();

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  if (url.pathname.startsWith('/api/')) {
    response.headers.set('X-Robots-Tag', 'noindex');
  }

  // SSR pages have no Cache-Control of their own; give them the edge TTL.
  if (cacheable && !response.headers.has('cache-control')) {
    response.headers.set('Cache-Control', htmlCacheControl(CACHE_TTL));
  }

  if (cache && cacheKey && isCacheableResponse(response)) {
    response.headers.set('X-Cache', 'MISS');
    if (version) response.headers.set('X-Cache-Version', version);
    const stored = response.clone();
    const waitUntil = (locals as any).runtime?.ctx?.waitUntil;
    if (typeof waitUntil === 'function') {
      waitUntil(cache.put(cacheKey, stored));
    } else {
      await cache.put(cacheKey, stored);
    }
  }

  return response;
});
