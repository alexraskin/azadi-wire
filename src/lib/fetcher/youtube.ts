import { decode } from 'he';

export interface YouTubeItem {
  video_id: string;
  title: string;
  description: string | null;
  channel_name: string;
  channel_id: string;
  thumbnail_url: string | null;
  published_at: string;
}

export async function fetchYouTubeFeed(feedUrl: string): Promise<YouTubeItem[]> {
  const items: YouTubeItem[] = [];

  try {
    const response = await fetch(feedUrl, {
      headers: { 'User-Agent': 'AzadiWire/1.0' },
    });
    if (!response.ok) return items;

    const xml = await response.text();

    const channelName = extractTag(xml, 'name') || 'Unknown';
    const channelId = extractTag(xml, 'yt:channelId') || '';

    const entries = matchAll(xml, /<entry>([\s\S]*?)<\/entry>/gi);

    for (const entry of entries) {
      const videoId = extractTag(entry, 'yt:videoId');
      const title = stripTags(extractTag(entry, 'title'));
      if (!videoId || !title) continue;

      const published = extractTag(entry, 'published') || '';
      const description = extractDescription(entry);
      const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      items.push({
        video_id: videoId,
        title,
        description,
        channel_name: channelName,
        channel_id: channelId,
        thumbnail_url: thumbnail,
        published_at: parseDate(published),
      });
    }
  } catch {
    // Feed fetch failed; skip silently
  }

  return items;
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
  const cdataRegex = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, 'i');
  const cdataMatch = cdataRegex.exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();

  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = regex.exec(xml);
  return match ? match[1].trim() : undefined;
}

function stripTags(str: string | undefined): string | undefined {
  if (!str) return str;
  return decode(str.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

function extractDescription(entry: string): string | null {
  const mediaGroup = /<media:group>([\s\S]*?)<\/media:group>/i.exec(entry);
  if (!mediaGroup) return null;

  const desc = extractTag(mediaGroup[1], 'media:description');
  if (!desc) return null;

  const text = decode(desc).trim();
  if (!text) return null;

  return text.length > 300 ? text.slice(0, 300) + '...' : text;
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
