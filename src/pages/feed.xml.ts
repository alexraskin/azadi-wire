import type { APIRoute } from 'astro';
import { getArticles } from '../lib/db';
import { TOPIC_LABELS } from '../lib/types';
import type { Topic } from '../lib/types';

const SITE_URL = 'https://azadiwire.org';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const GET: APIRoute = async ({ locals }) => {
  const db = (locals as any).runtime.env.DB;
  const { articles } = await getArticles(db, { limit: 50 });

  const items = articles
    .map((a) => {
      const topic = TOPIC_LABELS[a.topic as Topic] || a.topic;
      return `    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${escapeXml(a.article_url)}</link>
      <guid isPermaLink="false">${SITE_URL}/article/${a.id}</guid>
      <pubDate>${new Date(a.published_at).toUTCString()}</pubDate>
      <source url="${escapeXml(a.source_url)}">${escapeXml(a.source_name)}</source>
      <category>${escapeXml(topic)}</category>${a.summary ? `\n      <description>${escapeXml(a.summary)}</description>` : ''}
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Azadi Wire</title>
    <link>${SITE_URL}</link>
    <description>Independent English-language news aggregation focused on Iran</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900',
    },
  });
};
