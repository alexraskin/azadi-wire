import { defineMiddleware } from 'astro:middleware';
import {
  CACHE_TTL,
  NOT_FOUND_TTL,
  VERSION_TTL_MS,
  cacheProfile,
  entryState,
  fromStored,
  htmlCacheControl,
  isCacheableResponse,
  normalizeCacheKey,
  prepareForStore,
  ttlFor,
  type CacheProfile,
} from './lib/cache';
import { getContentVersion, getReadDB } from './lib/db';
import { env } from 'cloudflare:workers';

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
  // Miniflare implements the Cache API locally, which would serve stale pages
  // while editing, so only cache in real deployments.
  if (import.meta.env.DEV) return null;
  if (typeof caches === 'undefined') return null;
  return (caches as any).default ?? null;
}

type ExecutionCtx = { waitUntil(promise: Promise<unknown>): void } | undefined;

function background(ctx: ExecutionCtx, work: Promise<unknown>): boolean {
  if (typeof ctx?.waitUntil !== 'function') return false;
  ctx.waitUntil(work.catch(() => {}));
  return true;
}

// Per-isolate memo so the version lookup costs at most one D1 read per
// VERSION_TTL_MS, not one per request.
let versionCache: { value: string; expires: number } | null = null;
let versionRefresh: Promise<string> | null = null;

function readContentVersion(): Promise<string> {
  if (versionRefresh) return versionRefresh;
  versionRefresh = (async () => {
    const now = Date.now();
    let value: string;
    try {
      value = (await getContentVersion(getReadDB(env))) ?? 'none';
    } catch {
      // D1 unavailable: fall back to a time bucket so caching still works.
      value = `t${Math.floor(now / (CACHE_TTL * 1000))}`;
    }
    versionCache = { value, expires: Date.now() + VERSION_TTL_MS };
    return value;
  })().finally(() => {
    versionRefresh = null;
  });
  return versionRefresh;
}

/**
 * Current content version. An expired memo is still served while the reread
 * runs behind the request, so only the first request in an isolate ever waits
 * on D1 for it.
 */
async function contentVersion(ctx: ExecutionCtx): Promise<string> {
  const cached = versionCache;
  if (cached && cached.expires > Date.now()) return cached.value;
  const refresh = readContentVersion();
  if (cached && background(ctx, refresh)) return cached.value;
  return refresh;
}

// Collapses concurrent re-renders of the same key within an isolate, so a
// burst of requests on a stale entry renders the page once.
const revalidating = new Map<string, Promise<unknown>>();

function singleFlight(key: string, run: () => Promise<unknown>): Promise<unknown> {
  const existing = revalidating.get(key);
  if (existing) return existing;
  const started = run().finally(() => revalidating.delete(key));
  revalidating.set(key, started);
  return started;
}

function decorate(response: Response, pathname: string, profile: CacheProfile | null): Response {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  if (pathname.startsWith('/api/')) {
    response.headers.set('X-Robots-Tag', 'noindex');
  }

  // SSR pages have no Cache-Control of their own; give them the edge TTL.
  if (profile && !response.headers.has('cache-control')) {
    const ttl = response.status === 404 ? NOT_FOUND_TTL : profile.ttl;
    response.headers.set('Cache-Control', htmlCacheControl(ttl));
  }

  return response;
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

  const cacheable = request.method === 'GET' && !request.headers.has('authorization');
  const profile = cacheable ? cacheProfile(url.pathname) : null;
  const cache = profile ? edgeCache() : null;
  const ctx = (locals as any).cfContext as ExecutionCtx;

  if (!cache || !profile) {
    return decorate(await next(), url.pathname, profile);
  }

  const cacheKey = new Request(normalizeCacheKey(url.toString()), { method: 'GET' });
  const version = profile.versioned ? await contentVersion(ctx) : null;

  const render = async (): Promise<Response> => {
    const response = decorate(await next(), url.pathname, profile);
    if (isCacheableResponse(response)) {
      const stored = prepareForStore(response, {
        version,
        ttl: ttlFor(response.status, profile),
      });
      const put = cache.put(cacheKey, stored);
      if (!background(ctx, put)) await put;
    }
    return response;
  };

  const hit = await cache.match(cacheKey);
  if (hit) {
    const state = entryState(hit, version);
    // A stale entry still answers the request; the fresh copy lands behind it.
    // Without an execution context (local wrangler) there is nowhere to run
    // that, so re-render inline instead of serving stale forever.
    if (state === 'stale') {
      if (typeof ctx?.waitUntil !== 'function') return render();
      background(ctx, singleFlight(cacheKey.url, render));
    }
    return fromStored(hit, state);
  }

  const response = await render();
  response.headers.set('X-Cache', 'MISS');
  return response;
});
