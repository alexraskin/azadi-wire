import type { Article, Source } from '../types';
import { getActiveSources, articleUrlExists, getTodayTitles, insertArticle, deleteOldArticles, insertFetcherRun } from '../db';
import { fetchRSS } from './rss';
import { scrapePage } from './scraper';
import { categorize } from './categorizer';
import { isDuplicate } from './dedup';

export async function runFetcher(db: any, ai?: any): Promise<{ inserted: number; errors: number }> {
  const startedAt = new Date();
  let inserted = 0;
  let errors = 0;

  try {
    const sources = await getActiveSources(db);
    const existingTitles = await getTodayTitles(db);
    const now = new Date().toISOString();

    for (const source of sources) {
      try {
        const items = await fetchItemsForSource(source);

        for (const item of items) {
          const exists = await articleUrlExists(db, item.article_url);
          if (exists) continue;

          if (isDuplicate(item.title, existingTitles)) continue;

          const topic = await categorize(item.title, item.summary, ai);
          const article: Article = {
            id: crypto.randomUUID(),
            title: item.title,
            summary: item.summary,
            source_name: source.name,
            source_url: source.url,
            article_url: item.article_url,
            thumbnail_url: item.thumbnail_url,
            published_at: item.published_at,
            fetched_at: now,
            topic,
          };

          await insertArticle(db, article);
          existingTitles.push(item.title);
          inserted++;
        }
      } catch {
        errors++;
      }
    }

    await deleteOldArticles(db);
  } catch {
    errors++;
  }

  const finishedAt = new Date();
  try {
    await insertFetcherRun(db, {
      id: crypto.randomUUID(),
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      inserted,
      errors,
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
    });
  } catch {
    // Don't let logging failures break the fetcher
  }

  return { inserted, errors };
}

async function fetchItemsForSource(source: Source) {
  if (source.type === 'rss') {
    return fetchRSS(source.url);
  }
  return scrapePage(source.id, source.url);
}
