import rss from '@astrojs/rss';
import { getArticles, getReadDB } from '../lib/db';
import { TOPIC_LABELS } from '../lib/types';
import type { Topic } from '../lib/types';

const SITE_URL = 'https://azadiwire.org';

export const GET = async ({ locals }: { locals: any }) => {
  const db = getReadDB(locals.runtime.env);
  const { articles } = await getArticles(db, { limit: 50 });

  return rss({
    title: 'Azadi Wire',
    description: 'Independent English-language news aggregation focused on Iran',
    site: SITE_URL,
    xmlns: { media: 'http://search.yahoo.com/mrss/' },
    customData: '<language>en</language>',
    items: articles.map((a) => ({
      title: a.title,
      link: a.article_url,
      description: a.summary ?? undefined,
      pubDate: new Date(a.published_at),
      categories: [TOPIC_LABELS[a.topic as Topic] || a.topic],
      customData: [
        `<source url="${a.source_url ?? ''}">${a.source_name}</source>`,
        a.thumbnail_url
          ? `<media:content url="${a.thumbnail_url}" medium="image" />`
          : '',
      ]
        .filter(Boolean)
        .join('\n      '),
    })),
  });
};
