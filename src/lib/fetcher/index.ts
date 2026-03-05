import type { Article, Source, Video } from '../types';
import { slugify } from '../types';
import { getActiveSources, articleUrlExists, getTodayTitles, insertArticle, deleteOldArticles, insertFetcherRun, videoIdExists, insertVideo, deleteOldVideos } from '../db';
import { fetchRSS } from './rss';
import { scrapePage } from './scraper';
import { categorize } from './categorizer';
import { isDuplicate } from './dedup';
import { maybeGenerateDigest } from './digest';
import { fetchYouTubeFeed } from './youtube';

export async function runFetcher(db: any, ai?: any, env?: any): Promise<{ inserted: number; errors: number }> {
  const startedAt = new Date();
  let inserted = 0;
  let errors = 0;

  try {
    const sources = await getActiveSources(db);
    const articleSources = sources.filter((s) => s.type !== 'youtube');
    const youtubeSources = sources.filter((s) => s.type === 'youtube');
    const existingTitles = await getTodayTitles(db);
    const now = new Date().toISOString();

    for (const source of articleSources) {
      try {
        const items = await fetchItemsForSource(source);

        for (const item of items) {
          const exists = await articleUrlExists(db, item.article_url);
          if (exists) continue;

          if (isDuplicate(item.title, existingTitles)) continue;

          const topic = await categorize(item.title, item.summary, ai);
          const id = crypto.randomUUID();
          const slug = `${slugify(item.title)}-${id.slice(0, 6)}`;
          const article: Article = {
            id,
            slug,
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

    for (const source of youtubeSources) {
      try {
        const items = await fetchYouTubeFeed(source.url);
        for (const item of items) {
          const exists = await videoIdExists(db, item.video_id);
          if (exists) continue;

          const video: Video = {
            id: crypto.randomUUID(),
            video_id: item.video_id,
            title: item.title,
            description: item.description,
            channel_name: item.channel_name,
            channel_id: item.channel_id,
            thumbnail_url: item.thumbnail_url,
            published_at: item.published_at,
            fetched_at: now,
          };

          await insertVideo(db, video);
        }
      } catch {
        errors++;
      }
    }

    await deleteOldArticles(db);
    await deleteOldVideos(db);
  } catch {
    errors++;
  }

  try {
    await maybeGenerateDigest(db, ai, env);
  } catch {
    // Don't let digest failures break the fetcher
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
