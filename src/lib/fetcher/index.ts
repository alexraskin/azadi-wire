import type { Article, Source, Video } from '../types';
import { slugify } from '../types';
import { getActiveSources, getExistingArticleUrls, getTodayTitles, insertArticlesBatch, deleteOldArticles, insertFetcherRun, getExistingVideoIds, insertVideo, deleteOldVideos } from '../db';
import { fetchRSS } from './rss';
import { scrapePage } from './scraper';
import { categorize } from './categorizer';
import { isDuplicate } from './dedup';
import { maybeGenerateDigest } from './digest';
import { fetchYouTubeFeed } from './youtube';
import { MAX_FILLS_PER_RUN, deleteImages, storeImages } from './images';

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
    // Image fetches are budgeted across the whole run, not per source, so one
    // busy feed early in the list cannot spend the entire subrequest headroom.
    let imageBudget = MAX_FILLS_PER_RUN;

    for (const source of articleSources) {
      try {
        const items = await fetchItemsForSource(source);
        const candidateUrls = items.map((i) => i.article_url);
        const existingUrls = await getExistingArticleUrls(db, candidateUrls);

        const newItems = items.filter((item) => {
          if (existingUrls.has(item.article_url)) return false;
          if (isDuplicate(item.title, existingTitles)) return false;
          existingTitles.push(item.title);
          return true;
        });

        const categorized = await Promise.all(
          newItems.map((item) => categorize(item.title, item.summary, ai))
        );

        // Copy thumbnails into R2 before insert. cdn.azadiwire.org points
        // straight at the bucket, so an image missing here has no second
        // chance to be filled at request time; the article keeps the
        // publisher's URL instead.
        const storedImages = await storeImages(
          env?.CDN,
          newItems.map((item) => item.thumbnail_url),
          { limit: imageBudget }
        );
        imageBudget -= storedImages.attempted;

        const articles: Article[] = newItems.map((item, i) => {
          const { topic, importance } = categorized[i];
          const id = crypto.randomUUID();
          const slug = `${slugify(item.title)}-${id.slice(0, 6)}`;
          return {
            id,
            slug,
            title: item.title,
            summary: item.summary,
            source_name: source.name,
            source_url: source.url,
            article_url: item.article_url,
            thumbnail_url: item.thumbnail_url,
            image_key: item.thumbnail_url
              ? storedImages.keys.get(item.thumbnail_url) ?? null
              : null,
            published_at: item.published_at,
            fetched_at: now,
            topic,
            importance_score: importance,
          };
        });

        await insertArticlesBatch(db, articles);
        inserted += articles.length;
      } catch {
        errors++;
      }
    }

    for (const source of youtubeSources) {
      try {
        const items = await fetchYouTubeFeed(source.url);
        const candidateIds = items.map((i) => i.video_id);
        const existingIds = await getExistingVideoIds(db, candidateIds);

        for (const item of items) {
          if (existingIds.has(item.video_id)) continue;

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

    const purgedImageKeys = await deleteOldArticles(db);
    await deleteOldVideos(db);

    try {
      await deleteImages(env?.CDN, purgedImageKeys);
    } catch {
      // Orphaned objects are harmless; don't fail the run over cleanup.
    }
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
