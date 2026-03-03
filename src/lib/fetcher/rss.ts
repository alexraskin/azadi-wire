import type { FeedItem } from '../types';

export async function fetchRSS(feedUrl: string): Promise<FeedItem[]> {
  const items: FeedItem[] = [];

  try {
    const response = await fetch(feedUrl, {
      headers: { 'User-Agent': 'AzadiWire/1.0' },
    });
    if (!response.ok) return items;

    const xml = await response.text();
    const entries = parseRSSItems(xml);

    for (const entry of entries) {
      const title = entry.title?.trim();
      const link = entry.link?.trim();
      if (!title || !link) continue;

      items.push({
        title,
        summary: extractSummary(entry.description || entry.content || null),
        article_url: link,
        thumbnail_url: entry.thumbnail || null,
        published_at: parseDate(entry.pubDate || entry.updated || ''),
      });
    }
  } catch {
    // Feed fetch failed; skip silently
  }

  return items;
}

interface RSSEntry {
  title?: string;
  link?: string;
  description?: string;
  content?: string;
  pubDate?: string;
  updated?: string;
  thumbnail?: string;
}

function parseRSSItems(xml: string): RSSEntry[] {
  const entries: RSSEntry[] = [];

  // Handle RSS 2.0 <item> elements
  const rssItems = matchAll(xml, /<item[\s>]([\s\S]*?)<\/item>/gi);
  // Handle Atom <entry> elements
  const atomEntries = matchAll(xml, /<entry[\s>]([\s\S]*?)<\/entry>/gi);

  const allItems = [...rssItems, ...atomEntries];

  for (const itemXml of allItems) {
    entries.push({
      title: stripTags(extractTag(itemXml, 'title')),
      link: extractLink(itemXml),
      description: extractTag(itemXml, 'description') || extractTag(itemXml, 'summary'),
      content: extractTag(itemXml, 'content:encoded') || extractTag(itemXml, 'content'),
      pubDate: extractTag(itemXml, 'pubDate') || extractTag(itemXml, 'published') || extractTag(itemXml, 'updated') || extractTag(itemXml, 'dc:date'),
      thumbnail: extractThumbnail(itemXml),
    });
  }

  return entries;
}

function matchAll(text: string, regex: RegExp): string[] {
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    results.push(match[1]);
  }
  return results;
}

function extractTag(xml: string, tag: string): string | undefined {
  // Handle CDATA sections
  const cdataRegex = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, 'i');
  const cdataMatch = cdataRegex.exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();

  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = regex.exec(xml);
  return match ? match[1].trim() : undefined;
}

function extractLink(xml: string): string | undefined {
  // RSS <link> tag
  const linkTag = extractTag(xml, 'link');
  if (linkTag && linkTag.startsWith('http')) return linkTag;

  // Atom <link href="..."> tag
  const atomLink = /<link[^>]+href=["']([^"']+)["'][^>]*>/i.exec(xml);
  if (atomLink) return atomLink[1];

  // <guid> as fallback
  const guid = extractTag(xml, 'guid');
  if (guid && guid.startsWith('http')) return guid;

  return linkTag;
}

function extractThumbnail(xml: string): string | undefined {
  // <media:thumbnail url="...">
  const media = /<media:thumbnail[^>]+url=["']([^"']+)["']/i.exec(xml);
  if (media) return media[1];

  // <media:content url="...">
  const content = /<media:content[^>]+url=["']([^"']+)["']/i.exec(xml);
  if (content) return content[1];

  // <enclosure url="..." type="image/...">
  const enclosure = /<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image\//i.exec(xml);
  if (enclosure) return enclosure[1];

  return undefined;
}

function stripTags(str: string | undefined): string | undefined {
  if (!str) return str;
  return str.replace(/<[^>]*>/g, '').trim();
}

function extractSummary(html: string | null): string | null {
  if (!html) return null;
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  // Take first 2-3 sentences
  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (!sentences) return text.slice(0, 300);
  return sentences.slice(0, 3).join(' ').trim();
}

function parseDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString();
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return new Date().toISOString();
    return d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}
