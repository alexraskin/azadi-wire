import rss from '@astrojs/rss';
import { getTopArticles, getReadDB } from '../lib/db';
import { TOPIC_LABELS } from '../lib/types';
import type { Topic } from '../lib/types';

const SITE_URL = 'https://azadiwire.org';

export const GET = async ({ locals }: { locals: any }) => {
  const db = getReadDB(locals.runtime.env);
  const articles = await getTopArticles(db, { limit: 20, hoursBack: 72, minScore: 5 });

  return rss({
    title: 'Azadi Wire – Top Stories',
    description: 'Top AI-curated stories from Azadi Wire, ranked by importance',
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
