import { getReadDB } from '../lib/db';

const SITE_URL = 'https://azadiwire.org';

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const GET = async ({ locals }: { locals: any }) => {
  const db = getReadDB(locals.runtime.env);

  const [articles, digests] = await Promise.all([
    db
      .prepare(
        'SELECT slug, published_at FROM articles WHERE slug IS NOT NULL ORDER BY published_at DESC LIMIT 50000'
      )
      .all<{ slug: string; published_at: string }>(),
    db
      .prepare('SELECT digest_date FROM daily_digests ORDER BY digest_date DESC LIMIT 50000')
      .all<{ digest_date: string }>(),
  ]);

  const urls = articles.results.map(
    (a) =>
      `  <url>
    <loc>${SITE_URL}/article/${xmlEscape(a.slug)}</loc>
    <lastmod>${new Date(a.published_at).toISOString()}</lastmod>
    <changefreq>never</changefreq>
  </url>`
  );

  for (const d of digests.results) {
    urls.push(
      `  <url>
    <loc>${SITE_URL}/digest/${d.digest_date}</loc>
    <lastmod>${d.digest_date}T18:00:00Z</lastmod>
    <changefreq>never</changefreq>
  </url>`
    );
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
