import { describe, it, expect, vi, beforeEach } from 'vitest';
import { imageKey, imagePath } from '../images';
import { deleteImages, storeImage, storeImages, type ImageBucket } from './images';

function makeBucket(existing: string[] = []) {
  const objects = new Set(existing);
  return {
    objects,
    head: vi.fn(async (key: string) => (objects.has(key) ? { key } : null)),
    put: vi.fn(async (key: string, _value: ArrayBuffer, _options?: unknown) => {
      objects.add(key);
    }),
    delete: vi.fn(async (_keys: string | string[]) => {}),
  } satisfies ImageBucket & Record<string, unknown>;
}

function imageResponse(
  body: ArrayBuffer | Uint8Array,
  headers: Record<string, string> = {}
): Response {
  return new Response(body as BodyInit, {
    status: 200,
    headers: { 'content-type': 'image/jpeg', ...headers },
  });
}

const SRC = 'https://src.example/photo.jpg';

describe('storeImage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('stores the image and returns its key', async () => {
    const bucket = makeBucket();
    vi.mocked(fetch).mockResolvedValue(imageResponse(new Uint8Array([1, 2, 3])));

    const key = await storeImage(bucket, SRC);

    expect(key).toBe(await imageKey(SRC));
    expect(bucket.put).toHaveBeenCalledOnce();
    expect(bucket.put.mock.calls[0][0]).toBe(imagePath(key!));
  });

  it('stores content type and cache-control, which the cdn serves from metadata', async () => {
    const bucket = makeBucket();
    vi.mocked(fetch).mockResolvedValue(
      imageResponse(new Uint8Array([1]), { 'content-type': 'image/webp; charset=binary' })
    );

    await storeImage(bucket, SRC);

    const options = bucket.put.mock.calls[0][2] as {
      httpMetadata: { contentType: string; cacheControl: string };
    };
    expect(options.httpMetadata.contentType).toBe('image/webp');
    expect(options.httpMetadata.cacheControl).toContain('immutable');
  });

  it('skips the fetch when the object already exists', async () => {
    const key = await imageKey(SRC);
    const bucket = makeBucket([imagePath(key)]);

    expect(await storeImage(bucket, SRC)).toBe(key);
    expect(fetch).not.toHaveBeenCalled();
    expect(bucket.put).not.toHaveBeenCalled();
  });

  it('rejects svg, which would run script on our own hostname', async () => {
    const bucket = makeBucket();
    vi.mocked(fetch).mockResolvedValue(
      imageResponse(new Uint8Array([1]), { 'content-type': 'image/svg+xml' })
    );

    expect(await storeImage(bucket, SRC)).toBeNull();
    expect(bucket.put).not.toHaveBeenCalled();
  });

  it('rejects an oversize image declared by content-length without downloading it', async () => {
    const bucket = makeBucket();
    const response = imageResponse(new Uint8Array([1]), {
      'content-length': String(50 * 1024 * 1024),
    });
    const readBody = vi.spyOn(response, 'arrayBuffer');
    vi.mocked(fetch).mockResolvedValue(response);

    expect(await storeImage(bucket, SRC)).toBeNull();
    expect(readBody).not.toHaveBeenCalled();
  });

  it('rejects an oversize image that understated its content-length', async () => {
    const bucket = makeBucket();
    vi.mocked(fetch).mockResolvedValue(
      imageResponse(new Uint8Array(6 * 1024 * 1024), { 'content-length': '10' })
    );

    expect(await storeImage(bucket, SRC)).toBeNull();
    expect(bucket.put).not.toHaveBeenCalled();
  });

  it('rejects an empty body', async () => {
    const bucket = makeBucket();
    vi.mocked(fetch).mockResolvedValue(imageResponse(new Uint8Array()));

    expect(await storeImage(bucket, SRC)).toBeNull();
  });

  it('returns null on a non-200', async () => {
    const bucket = makeBucket();
    vi.mocked(fetch).mockResolvedValue(new Response('gone', { status: 404 }));

    expect(await storeImage(bucket, SRC)).toBeNull();
  });

  it('returns null when the fetch throws', async () => {
    const bucket = makeBucket();
    vi.mocked(fetch).mockRejectedValue(new Error('timed out'));

    expect(await storeImage(bucket, SRC)).toBeNull();
  });

  it('refuses a non-http url', async () => {
    const bucket = makeBucket();

    expect(await storeImage(bucket, 'data:image/png;base64,AAAA')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('storeImages', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse(new Uint8Array([1]))));
  });

  it('maps each stored url to its key and skips nulls', async () => {
    const bucket = makeBucket();

    const { keys, attempted } = await storeImages(bucket, [
      'https://src.example/a.jpg',
      null,
      'https://src.example/b.jpg',
    ]);

    expect(attempted).toBe(2);
    expect(keys.get('https://src.example/a.jpg')).toBe(
      await imageKey('https://src.example/a.jpg')
    );
    expect(keys.has('https://src.example/b.jpg')).toBe(true);
  });

  it('fetches a repeated url once', async () => {
    const bucket = makeBucket();

    const { attempted } = await storeImages(bucket, [SRC, SRC, SRC]);

    expect(attempted).toBe(1);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('honours the limit, so one busy feed cannot spend the run budget', async () => {
    const bucket = makeBucket();
    const urls = Array.from({ length: 10 }, (_, i) => `https://src.example/${i}.jpg`);

    const { keys, attempted } = await storeImages(bucket, urls, { limit: 3 });

    expect(attempted).toBe(3);
    expect(keys.size).toBe(3);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('does nothing with a zero budget', async () => {
    const bucket = makeBucket();

    const { attempted } = await storeImages(bucket, [SRC], { limit: 0 });

    expect(attempted).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('counts a failed url against the budget', async () => {
    const bucket = makeBucket();
    vi.mocked(fetch).mockResolvedValue(new Response('gone', { status: 404 }));

    const { keys, attempted } = await storeImages(bucket, [SRC]);

    expect(attempted).toBe(1);
    expect(keys.size).toBe(0);
  });

  it('is a no-op without a bucket binding, so astro dev still runs', async () => {
    const { keys, attempted } = await storeImages(undefined, [SRC]);

    expect(keys.size).toBe(0);
    expect(attempted).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('deleteImages', () => {
  it('deletes prefixed paths', async () => {
    const bucket = makeBucket();

    await deleteImages(bucket, ['aaa', 'bbb']);

    expect(bucket.delete).toHaveBeenCalledWith(['thumbs/aaa', 'thumbs/bbb']);
  });

  it('chunks to R2 per-call limit of 1000 keys', async () => {
    const bucket = makeBucket();
    const keys = Array.from({ length: 2500 }, (_, i) => `k${i}`);

    await deleteImages(bucket, keys);

    expect(bucket.delete).toHaveBeenCalledTimes(3);
    expect(bucket.delete.mock.calls[0][0]).toHaveLength(1000);
    expect(bucket.delete.mock.calls[2][0]).toHaveLength(500);
  });

  it('skips the call for an empty list or a missing binding', async () => {
    const bucket = makeBucket();

    await deleteImages(bucket, []);
    await deleteImages(undefined, ['aaa']);

    expect(bucket.delete).not.toHaveBeenCalled();
  });
});
