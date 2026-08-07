import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchRSS } from './rss';

/** Stub global fetch with a single XML body. */
function stubFeed(xml: string, init: ResponseInit = {}) {
  const fn = vi.fn().mockResolvedValue(new Response(xml, { status: 200, ...init }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

function rss(items: string): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel>${items}</channel></rss>`;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchRSS — request', () => {
  it('identifies itself with a User-Agent', async () => {
    const fn = stubFeed(rss(''));
    await fetchRSS('https://example.com/feed.xml');
    expect(fn).toHaveBeenCalledWith('https://example.com/feed.xml', {
      headers: { 'User-Agent': 'AzadiWire/1.0' },
    });
  });

  it('returns an empty list on a non-2xx response', async () => {
    stubFeed('boom', { status: 500 });
    await expect(fetchRSS('https://example.com/feed.xml')).resolves.toEqual([]);
  });

  it('returns an empty list when the fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENOTFOUND')));
    await expect(fetchRSS('https://example.com/feed.xml')).resolves.toEqual([]);
  });

  it('returns an empty list for non-feed content', async () => {
    stubFeed('<html><body>not a feed</body></html>');
    await expect(fetchRSS('https://example.com/feed.xml')).resolves.toEqual([]);
  });
});

describe('fetchRSS — RSS 2.0', () => {
  it('extracts title, link, summary and date', async () => {
    stubFeed(
      rss(`
        <item>
          <title>Nuclear talks resume</title>
          <link>https://example.com/a</link>
          <description>First sentence. Second sentence. Third sentence. Fourth sentence.</description>
          <pubDate>Wed, 05 Aug 2026 10:00:00 GMT</pubDate>
        </item>`)
    );
    const [item] = await fetchRSS('https://example.com/feed.xml');
    expect(item).toMatchObject({
      title: 'Nuclear talks resume',
      article_url: 'https://example.com/a',
      published_at: '2026-08-05T10:00:00.000Z',
    });
    // Sentence splitting keeps the leading space on each match and then joins
    // with another space, so summaries carry a double space between sentences.
    expect(item.summary).toBe('First sentence.  Second sentence.  Third sentence.');
  });

  it('unwraps CDATA and decodes entities in titles', async () => {
    stubFeed(
      rss(`
        <item>
          <title><![CDATA[Iran&amp;s &quot;red line&quot;]]></title>
          <link>https://example.com/b</link>
        </item>`)
    );
    const [item] = await fetchRSS('https://example.com/feed.xml');
    expect(item.title).toBe('Iran&s "red line"');
  });

  it('strips HTML from the summary', async () => {
    stubFeed(
      rss(`
        <item>
          <title>Report</title>
          <link>https://example.com/c</link>
          <description><![CDATA[<p>Tehran <b>responds</b> today.</p>]]></description>
        </item>`)
    );
    const [item] = await fetchRSS('https://example.com/feed.xml');
    expect(item.summary).toBe('Tehran responds today.');
  });

  it('falls back to <guid> when <link> is not a URL', async () => {
    stubFeed(
      rss(`
        <item>
          <title>Report</title>
          <link>not-a-url</link>
          <guid>https://example.com/d</guid>
        </item>`)
    );
    const [item] = await fetchRSS('https://example.com/feed.xml');
    expect(item.article_url).toBe('https://example.com/d');
  });

  it('skips items missing a title or link', async () => {
    stubFeed(
      rss(`
        <item><link>https://example.com/e</link></item>
        <item><title>No link here</title></item>
        <item><title>Good</title><link>https://example.com/f</link></item>`)
    );
    const items = await fetchRSS('https://example.com/feed.xml');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Good');
  });

  it('defaults published_at to now when the date is missing or unparseable', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T12:00:00.000Z'));
    stubFeed(
      rss(`
        <item><title>No date</title><link>https://example.com/g</link></item>
        <item><title>Bad date</title><link>https://example.com/h</link><pubDate>yesterday-ish</pubDate></item>`)
    );
    const items = await fetchRSS('https://example.com/feed.xml');
    expect(items.map((i) => i.published_at)).toEqual([
      '2026-08-07T12:00:00.000Z',
      '2026-08-07T12:00:00.000Z',
    ]);
    vi.useRealTimers();
  });
});

describe('fetchRSS — Atom', () => {
  it('reads <entry> elements and href links', async () => {
    stubFeed(
      `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <title>Atom headline</title>
          <link rel="alternate" href="https://example.com/atom-1"/>
          <summary>An atom summary.</summary>
          <published>2026-08-01T08:00:00Z</published>
        </entry>
      </feed>`
    );
    const [item] = await fetchRSS('https://example.com/atom.xml');
    expect(item).toMatchObject({
      title: 'Atom headline',
      article_url: 'https://example.com/atom-1',
      summary: 'An atom summary.',
      published_at: '2026-08-01T08:00:00.000Z',
    });
  });
});

describe('fetchRSS — thumbnails', () => {
  it('prefers the widest media candidate', async () => {
    stubFeed(
      rss(`
        <item>
          <title>Photo story</title>
          <link>https://example.com/i</link>
          <media:thumbnail url="https://img.example.com/small.jpg" width="150"/>
          <media:content url="https://img.example.com/large.jpg" width="1200" medium="image"/>
        </item>`)
    );
    const [item] = await fetchRSS('https://example.com/feed.xml');
    expect(item.thumbnail_url).toBe('https://img.example.com/large.jpg');
  });

  it('reads an image <enclosure>', async () => {
    stubFeed(
      rss(`
        <item>
          <title>Enclosure story</title>
          <link>https://example.com/j</link>
          <enclosure url="https://img.example.com/enc.jpg" type="image/jpeg"/>
        </item>`)
    );
    const [item] = await fetchRSS('https://example.com/feed.xml');
    expect(item.thumbnail_url).toBe('https://img.example.com/enc.jpg');
  });

  it('recovers an <img> from double-encoded HTML in the description', async () => {
    stubFeed(
      rss(`
        <item>
          <title>Encoded image</title>
          <link>https://example.com/k</link>
          <description>&amp;lt;img src="https://img.example.com/deep.jpg"&amp;gt;</description>
        </item>`)
    );
    const [item] = await fetchRSS('https://example.com/feed.xml');
    expect(item.thumbnail_url).toBe('https://img.example.com/deep.jpg');
  });

  it('is null when the feed carries no image', async () => {
    stubFeed(rss('<item><title>Plain</title><link>https://example.com/l</link></item>'));
    const [item] = await fetchRSS('https://example.com/feed.xml');
    expect(item.thumbnail_url).toBeNull();
  });

  it('ignores non-image media:content', async () => {
    stubFeed(
      rss(`
        <item>
          <title>Audio</title>
          <link>https://example.com/m</link>
          <media:content url="https://cdn.example.com/clip.mp3" type="audio/mpeg"/>
        </item>`)
    );
    const [item] = await fetchRSS('https://example.com/feed.xml');
    expect(item.thumbnail_url).toBeNull();
  });
});

describe('fetchRSS — Spanish filtering', () => {
  it('drops items under an /es/ URL path', async () => {
    stubFeed(
      rss(`
        <item><title>English headline</title><link>https://nytimes.com/es/2026/iran</link></item>`)
    );
    await expect(fetchRSS('https://example.com/feed.xml')).resolves.toEqual([]);
  });

  it('drops titles with two or more Spanish stopwords', async () => {
    stubFeed(
      rss(`
        <item><title>El gobierno de Irán dice que puede negociar</title><link>https://example.com/n</link></item>`)
    );
    await expect(fetchRSS('https://example.com/feed.xml')).resolves.toEqual([]);
  });

  it('keeps English titles containing a single ambiguous word', async () => {
    stubFeed(
      rss(`
        <item><title>Como protests spread</title><link>https://example.com/o</link></item>`)
    );
    const items = await fetchRSS('https://example.com/feed.xml');
    expect(items).toHaveLength(1);
  });
});
