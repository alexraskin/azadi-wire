import type { FeedItem } from '../types';

interface ScrapeConfig {
  articleSelector: string;
  titleSelector: string;
  linkSelector: string;
  summarySelector?: string;
  thumbnailSelector?: string;
  dateSelector?: string;
}

export const SCRAPE_CONFIGS: Record<string, ScrapeConfig> = {
  // Add per-source scrape configs here as needed
  // 'src-example': {
  //   articleSelector: 'article.post',
  //   titleSelector: 'h2 a',
  //   linkSelector: 'h2 a',
  //   summarySelector: 'p.excerpt',
  //   dateSelector: 'time',
  // },
};

export async function scrapePage(
  sourceId: string,
  url: string
): Promise<FeedItem[]> {
  const config = SCRAPE_CONFIGS[sourceId];
  if (!config) return [];

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'AzadiWire/1.0' },
    });
    if (!response.ok) return [];

    const html = await response.text();
    return parseHTML(html, url, config);
  } catch {
    return [];
  }
}

function parseHTML(html: string, baseUrl: string, config: ScrapeConfig): FeedItem[] {
  const items: FeedItem[] = [];

  const articleBlocks = matchAllBlocks(html, config.articleSelector);

  for (const block of articleBlocks) {
    const title = extractText(block, config.titleSelector);
    const link = extractHref(block, config.linkSelector, baseUrl);
    if (!title || !link) continue;

    items.push({
      title,
      summary: config.summarySelector ? extractText(block, config.summarySelector) : null,
      article_url: link,
      thumbnail_url: config.thumbnailSelector ? extractSrc(block, config.thumbnailSelector) : null,
      published_at: config.dateSelector
        ? parseDateFromText(extractText(block, config.dateSelector) || '')
        : new Date().toISOString(),
    });
  }

  return items;
}

function matchAllBlocks(html: string, selector: string): string[] {
  const tag = selector.replace(/[.#\[\]="\s].*/g, '') || 'div';
  const classMatch = selector.match(/\.([^\s.#\[]+)/);
  const className = classMatch ? classMatch[1] : null;

  const results: string[] = [];
  const regex = className
    ? new RegExp(`<${tag}[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi')
    : new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');

  let match;
  while ((match = regex.exec(html)) !== null) {
    results.push(match[0]);
  }
  return results;
}

function extractText(html: string, selector: string): string | null {
  const tag = selector.replace(/[.#\[\]="\s].*/g, '') || 'span';
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = regex.exec(html);
  if (!match) return null;
  return match[1].replace(/<[^>]*>/g, '').trim();
}

function extractHref(html: string, selector: string, baseUrl: string): string | null {
  const regex = /<a[^>]+href=["']([^"']+)["']/i;
  const match = regex.exec(html);
  if (!match) return null;
  const href = match[1];
  if (href.startsWith('http')) return href;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractSrc(html: string, _selector: string): string | null {
  const regex = /<img[^>]+src=["']([^"']+)["']/i;
  const match = regex.exec(html);
  return match ? match[1] : null;
}

function parseDateFromText(text: string): string {
  if (!text) return new Date().toISOString();
  try {
    const d = new Date(text);
    if (isNaN(d.getTime())) return new Date().toISOString();
    return d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}
