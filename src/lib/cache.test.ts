import { describe, it, expect } from 'vitest';
import {
  ARTICLE_TTL,
  CACHE_TTL,
  DIGEST_TTL,
  HEADER_CLIENT_CONTROL,
  HEADER_FRESH_UNTIL,
  HEADER_STORED_AT,
  HEADER_VERSION,
  NOT_FOUND_TTL,
  STATIC_TTL,
  cacheControl,
  cacheProfile,
  entryState,
  fromStored,
  htmlCacheControl,
  isCacheablePath,
  isCacheableResponse,
  normalizeCacheKey,
  prepareForStore,
  ttlFor,
} from './cache';

describe('cacheControl', () => {
  it('defaults to the fetcher interval', () => {
    expect(CACHE_TTL).toBe(900);
    expect(cacheControl()).toBe(
      'public, max-age=900, s-maxage=900, stale-while-revalidate=900'
    );
  });

  it('accepts a custom ttl', () => {
    expect(cacheControl(60)).toBe(
      'public, max-age=60, s-maxage=60, stale-while-revalidate=60'
    );
  });
});

describe('htmlCacheControl', () => {
  it('lets browsers revalidate but keeps the edge copy', () => {
    expect(htmlCacheControl()).toBe(
      'public, max-age=0, s-maxage=900, stale-while-revalidate=900'
    );
  });
});

describe('isCacheablePath', () => {
  it('allows public pages, feeds and read APIs', () => {
    for (const p of ['/', '/article/some-slug', '/feed.xml', '/api/articles', '/digest']) {
      expect(isCacheablePath(p)).toBe(true);
    }
  });

  it('blocks cron, status and subscription endpoints', () => {
    for (const p of [
      '/api/cron',
      '/api/status',
      '/api/subscribe',
      '/api/unsubscribe',
      '/subscribe',
      '/unsubscribe',
    ]) {
      expect(isCacheablePath(p)).toBe(false);
    }
  });
});

describe('cacheProfile', () => {
  it('returns null for uncacheable paths', () => {
    expect(cacheProfile('/api/cron')).toBeNull();
    expect(cacheProfile('/subscribe')).toBeNull();
  });

  it('versions article-derived paths against the fetcher run', () => {
    for (const p of ['/', '/videos', '/api/articles', '/feed.xml', '/api/search']) {
      expect(cacheProfile(p)).toEqual({ ttl: CACHE_TTL, versioned: true });
    }
  });

  it('holds immutable content longer and skips versioning', () => {
    expect(cacheProfile('/article/some-slug')).toEqual({ ttl: ARTICLE_TTL, versioned: false });
    expect(cacheProfile('/api/articles/some-slug')).toEqual({ ttl: ARTICLE_TTL, versioned: false });
    expect(cacheProfile('/digest/2026-01-01')).toEqual({ ttl: DIGEST_TTL, versioned: false });
    expect(cacheProfile('/about')).toEqual({ ttl: STATIC_TTL, versioned: false });
  });

  it('keeps the digest index on the versioned profile', () => {
    expect(cacheProfile('/digest')).toEqual({ ttl: CACHE_TTL, versioned: true });
  });
});

describe('ttlFor', () => {
  it('stores 404s briefly regardless of the profile', () => {
    const profile = { ttl: ARTICLE_TTL, versioned: false };
    expect(ttlFor(200, profile)).toBe(ARTICLE_TTL);
    expect(ttlFor(404, profile)).toBe(NOT_FOUND_TTL);
  });
});

describe('normalizeCacheKey', () => {
  it('keeps params that change the rendered page', () => {
    const key = normalizeCacheKey('https://azadiwire.org/?topic=war&page=2');
    const params = new URL(key).searchParams;
    expect(params.get('topic')).toBe('war');
    expect(params.get('page')).toBe('2');
  });

  it('drops tracking and cache-buster params', () => {
    expect(normalizeCacheKey('https://azadiwire.org/?utm_source=x&fbclid=y&_=123')).toBe(
      'https://azadiwire.org/'
    );
  });

  it('is order independent', () => {
    expect(normalizeCacheKey('https://azadiwire.org/?page=2&topic=war')).toBe(
      normalizeCacheKey('https://azadiwire.org/?topic=war&page=2')
    );
  });

  it('ignores empty values and the URL fragment', () => {
    expect(normalizeCacheKey('https://azadiwire.org/?topic=#top')).toBe('https://azadiwire.org/');
  });

  it('separates distinct paths and values', () => {
    expect(normalizeCacheKey('https://azadiwire.org/videos?channel=a')).not.toBe(
      normalizeCacheKey('https://azadiwire.org/videos?channel=b')
    );
  });
});

describe('isCacheableResponse', () => {
  const ok = (headers: Record<string, string> = {}, status = 200) =>
    new Response('body', { status, headers });

  it('caches plain 200s', () => {
    expect(isCacheableResponse(ok({ 'Cache-Control': cacheControl() }))).toBe(true);
  });

  it('caches 404s so dead slugs do not reach the database', () => {
    expect(isCacheableResponse(ok({}, 404))).toBe(true);
  });

  it('skips other non-200 responses', () => {
    expect(isCacheableResponse(ok({}, 500))).toBe(false);
    expect(isCacheableResponse(ok({}, 302))).toBe(false);
  });

  it('skips responses that set cookies or opt out', () => {
    expect(isCacheableResponse(ok({ 'Set-Cookie': 'a=b' }))).toBe(false);
    expect(isCacheableResponse(ok({ 'Cache-Control': 'private, no-store' }))).toBe(false);
  });
});

describe('prepareForStore', () => {
  const now = 1_700_000_000_000;

  const stored = (version: string | null = 'run-1', ttl = 900) =>
    prepareForStore(new Response('body', { headers: { 'Cache-Control': cacheControl() } }), {
      version,
      ttl,
      now,
    });

  it('records the version and the freshness deadline', () => {
    const entry = stored();
    expect(entry.headers.get(HEADER_VERSION)).toBe('run-1');
    expect(entry.headers.get(HEADER_FRESH_UNTIL)).toBe(String(now + 900_000));
    expect(entry.headers.get(HEADER_STORED_AT)).toBe(String(now));
  });

  it('keeps the entry past its ttl so it can be served stale', () => {
    expect(stored().headers.get('Cache-Control')).toBe('public, s-maxage=87300');
  });

  it('preserves the client Cache-Control for replay', () => {
    expect(stored().headers.get(HEADER_CLIENT_CONTROL)).toBe(cacheControl());
  });

  it('marks unversioned entries', () => {
    expect(stored(null).headers.get(HEADER_VERSION)).toBe('none');
  });
});

describe('entryState', () => {
  const now = 1_700_000_000_000;
  const entry = (version: string | null, ttl = 900) =>
    prepareForStore(new Response('body'), { version, ttl, now });

  it('is fresh inside the ttl on the current version', () => {
    expect(entryState(entry('run-1'), 'run-1', now + 1000)).toBe('fresh');
  });

  it('goes stale past the ttl', () => {
    expect(entryState(entry('run-1'), 'run-1', now + 900_001)).toBe('stale');
  });

  it('goes stale when the fetcher inserted new articles', () => {
    expect(entryState(entry('run-1'), 'run-2', now + 1000)).toBe('stale');
  });

  it('ignores the version for unversioned profiles', () => {
    expect(entryState(entry('run-1'), null, now + 1000)).toBe('fresh');
  });

  it('treats an entry without freshness metadata as stale', () => {
    expect(entryState(new Response('body'), null, now)).toBe('stale');
  });
});

describe('fromStored', () => {
  const now = 1_700_000_000_000;
  const entry = prepareForStore(
    new Response('body', { headers: { 'Cache-Control': cacheControl(), 'X-Robots-Tag': 'noindex' } }),
    { version: 'run-1', ttl: 900, now }
  );

  it('restores the client Cache-Control and drops internal headers', () => {
    const served = fromStored(entry.clone(), 'fresh', now + 60_000);
    expect(served.headers.get('Cache-Control')).toBe(cacheControl());
    expect(served.headers.get('X-Robots-Tag')).toBe('noindex');
    for (const h of [HEADER_VERSION, HEADER_FRESH_UNTIL, HEADER_STORED_AT, HEADER_CLIENT_CONTROL]) {
      expect(served.headers.has(h)).toBe(false);
    }
  });

  it('reports age so downstream caches subtract the time already spent', () => {
    expect(fromStored(entry.clone(), 'fresh', now + 60_000).headers.get('Age')).toBe('60');
  });

  it('labels hits and stale serves', () => {
    expect(fromStored(entry.clone(), 'fresh', now).headers.get('X-Cache')).toBe('HIT');
    expect(fromStored(entry.clone(), 'stale', now).headers.get('X-Cache')).toBe('STALE');
  });

  it('keeps the body and status', async () => {
    const served = fromStored(entry.clone(), 'fresh', now);
    expect(served.status).toBe(200);
    expect(await served.text()).toBe('body');
  });
});
