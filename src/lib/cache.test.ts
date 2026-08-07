import { describe, it, expect } from 'vitest';
import {
  CACHE_TTL,
  CACHE_VERSION_PARAM,
  cacheKeyUrl,
  cacheControl,
  htmlCacheControl,
  isCacheablePath,
  isCacheableResponse,
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
      '/unsubscribe',
    ]) {
      expect(isCacheablePath(p)).toBe(false);
    }
  });
});

describe('cacheKeyUrl', () => {
  it('adds the version to the key', () => {
    expect(cacheKeyUrl('https://azadiwire.org/', 'run-1')).toBe(
      'https://azadiwire.org/?__cv=run-1'
    );
  });

  it('keeps existing query params and their values', () => {
    const key = cacheKeyUrl('https://azadiwire.org/?topic=war&page=2', 'run-1');
    const params = new URL(key).searchParams;
    expect(params.get('topic')).toBe('war');
    expect(params.get('page')).toBe('2');
    expect(params.get(CACHE_VERSION_PARAM)).toBe('run-1');
  });

  it('produces a different key per version and the same key per URL', () => {
    const a = cacheKeyUrl('https://azadiwire.org/', 'run-1');
    const b = cacheKeyUrl('https://azadiwire.org/', 'run-2');
    expect(a).not.toBe(b);
    expect(cacheKeyUrl('https://azadiwire.org/', 'run-1')).toBe(a);
  });

  it('overwrites a client-supplied version param', () => {
    const key = cacheKeyUrl('https://azadiwire.org/?__cv=spoofed', 'run-1');
    expect(new URL(key).searchParams.getAll(CACHE_VERSION_PARAM)).toEqual(['run-1']);
  });
});

describe('isCacheableResponse', () => {
  const ok = (headers: Record<string, string> = {}, status = 200) =>
    new Response('body', { status, headers });

  it('caches plain 200s', () => {
    expect(isCacheableResponse(ok({ 'Cache-Control': cacheControl() }))).toBe(true);
  });

  it('skips non-200 responses', () => {
    expect(isCacheableResponse(ok({}, 404))).toBe(false);
    expect(isCacheableResponse(ok({}, 500))).toBe(false);
  });

  it('skips responses that set cookies or opt out', () => {
    expect(isCacheableResponse(ok({ 'Set-Cookie': 'a=b' }))).toBe(false);
    expect(isCacheableResponse(ok({ 'Cache-Control': 'private, no-store' }))).toBe(false);
  });
});
