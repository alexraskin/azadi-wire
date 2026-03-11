import type { Article, Source, TopicCount, Topic, DailyDigest, Video } from './types';

type D1Database = {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  withSession(bookmark?: string): D1Database;
};

export function getReadDB(env: any): D1Database {
  return env.DB.withSession();
}

export function getWriteDB(env: any): D1Database {
  return env.DB.withSession('first-primary');
}

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = unknown>(): Promise<D1Result<T>>;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<D1Result>;
};

type D1Result<T = unknown> = {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
};

export async function getArticles(
  db: D1Database,
  opts: { topic?: string; source?: string; page?: number; limit?: number } = {}
): Promise<{ articles: Article[]; total: number; page: number; pages: number }> {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, Math.max(1, opts.limit || 20));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.topic && opts.topic !== 'all') {
    conditions.push('topic = ?');
    params.push(opts.topic);
  }

  if (opts.source) {
    conditions.push('source_name = ?');
    params.push(opts.source);
  }

  const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

  const countResult = await db
    .prepare('SELECT COUNT(*) as total FROM articles' + where)
    .bind(...params)
    .first<{ total: number }>();
  const total = countResult?.total || 0;

  const listResult = await db
    .prepare('SELECT * FROM articles' + where + ' ORDER BY published_at DESC LIMIT ? OFFSET ?')
    .bind(...params, limit, offset)
    .all<Article>();

  return {
    articles: listResult.results,
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

export async function getArticleById(
  db: D1Database,
  id: string
): Promise<Article | null> {
  return db.prepare('SELECT * FROM articles WHERE id = ?').bind(id).first<Article>();
}

export async function getArticleBySlug(
  db: D1Database,
  slug: string
): Promise<Article | null> {
  return db.prepare('SELECT * FROM articles WHERE slug = ?').bind(slug).first<Article>();
}

export async function getTopicCounts(db: D1Database): Promise<TopicCount[]> {
  const result = await db
    .prepare('SELECT topic as name, COUNT(*) as count FROM articles GROUP BY topic ORDER BY count DESC')
    .all<TopicCount>();
  return result.results;
}

export async function getActiveSources(db: D1Database): Promise<Source[]> {
  const result = await db
    .prepare('SELECT * FROM sources WHERE active = 1 ORDER BY name')
    .all<Source>();
  return result.results;
}

export async function getAllSources(db: D1Database): Promise<Source[]> {
  const result = await db
    .prepare('SELECT * FROM sources ORDER BY name')
    .all<Source>();
  return result.results;
}

export async function getArticleSourceNames(db: D1Database): Promise<string[]> {
  const result = await db
    .prepare('SELECT DISTINCT source_name FROM articles ORDER BY source_name')
    .all<{ source_name: string }>();
  return result.results.map((r) => r.source_name);
}

export async function articleUrlExists(
  db: D1Database,
  url: string
): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 FROM articles WHERE article_url = ?')
    .bind(url)
    .first();
  return row !== null;
}

export async function getTodayTitles(db: D1Database): Promise<string[]> {
  const today = new Date().toISOString().slice(0, 10);
  const result = await db
    .prepare("SELECT title FROM articles WHERE published_at >= ? || 'T00:00:00.000Z'")
    .bind(today)
    .all<{ title: string }>();
  return result.results.map((r) => r.title);
}

export async function insertArticle(
  db: D1Database,
  article: Article
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO articles (id, slug, title, summary, source_name, source_url, article_url, thumbnail_url, published_at, fetched_at, topic, importance_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      article.id,
      article.slug,
      article.title,
      article.summary,
      article.source_name,
      article.source_url,
      article.article_url,
      article.thumbnail_url,
      article.published_at,
      article.fetched_at,
      article.topic,
      article.importance_score
    )
    .run();
}

export async function getTopArticles(
  db: D1Database,
  opts: { limit?: number; hoursBack?: number; minScore?: number } = {}
): Promise<Article[]> {
  const limit = opts.limit ?? 5;
  const hoursBack = opts.hoursBack ?? 48;
  const minScore = opts.minScore ?? 7;
  const cutoff = new Date(Date.now() - hoursBack * 3600000).toISOString();
  const result = await db
    .prepare(
      `SELECT * FROM articles
       WHERE published_at >= ? AND importance_score >= ?
       ORDER BY importance_score DESC, published_at DESC
       LIMIT ?`
    )
    .bind(cutoff, minScore, limit)
    .all<Article>();
  return result.results;
}

export async function searchArticles(
  db: D1Database,
  query: string,
  opts: { page?: number; limit?: number } = {}
): Promise<{ articles: Article[]; total: number; page: number; pages: number }> {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, Math.max(1, opts.limit || 20));
  const offset = (page - 1) * limit;

  const cleaned = query.replace(/[*"():^{}~\-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return { articles: [], total: 0, page: 1, pages: 0 };
  }
  const safeQuery = `"${cleaned.replace(/"/g, '""')}"`;

  const countResult = await db
    .prepare('SELECT COUNT(*) as total FROM articles_fts WHERE articles_fts MATCH ?')
    .bind(safeQuery)
    .first<{ total: number }>();
  const total = countResult?.total || 0;

  const listResult = await db
    .prepare(
      `SELECT a.* FROM articles a
       JOIN articles_fts fts ON a.rowid = fts.rowid
       WHERE articles_fts MATCH ?
       ORDER BY fts.rank
       LIMIT ? OFFSET ?`
    )
    .bind(safeQuery, limit, offset)
    .all<Article>();

  return {
    articles: listResult.results,
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

export async function deleteOldArticles(db: D1Database, daysOld: number = 90): Promise<void> {
  const cutoff = new Date(Date.now() - daysOld * 86400000).toISOString();
  await db.prepare('DELETE FROM articles WHERE published_at < ?').bind(cutoff).run();
}

export interface FetcherRun {
  id: string;
  started_at: string;
  finished_at: string;
  inserted: number;
  errors: number;
  duration_ms: number;
}

export async function insertFetcherRun(db: D1Database, run: FetcherRun): Promise<void> {
  await db
    .prepare(
      `INSERT INTO fetcher_runs (id, started_at, finished_at, inserted, errors, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(run.id, run.started_at, run.finished_at, run.inserted, run.errors, run.duration_ms)
    .run();
}

export async function getRecentFetcherRuns(db: D1Database, limit: number = 10): Promise<FetcherRun[]> {
  const result = await db
    .prepare('SELECT * FROM fetcher_runs ORDER BY started_at DESC LIMIT ?')
    .bind(limit)
    .all<FetcherRun>();
  return result.results;
}

export async function digestExistsForDate(db: D1Database, date: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 FROM daily_digests WHERE digest_date = ?')
    .bind(date)
    .first();
  return row !== null;
}

export async function insertDigest(db: D1Database, digest: DailyDigest): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO daily_digests (id, digest_date, overall_summary, topic_summaries, article_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      digest.id,
      digest.digest_date,
      digest.overall_summary,
      digest.topic_summaries,
      digest.article_count,
      digest.created_at
    )
    .run();
}

export async function getDigestByDate(db: D1Database, date: string): Promise<DailyDigest | null> {
  return db
    .prepare('SELECT * FROM daily_digests WHERE digest_date = ?')
    .bind(date)
    .first<DailyDigest>();
}

export async function getRecentDigests(db: D1Database, limit: number = 7): Promise<DailyDigest[]> {
  const result = await db
    .prepare('SELECT * FROM daily_digests ORDER BY digest_date DESC LIMIT ?')
    .bind(limit)
    .all<DailyDigest>();
  return result.results;
}

export async function videoIdExists(db: D1Database, videoId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 FROM videos WHERE video_id = ?')
    .bind(videoId)
    .first();
  return row !== null;
}

export async function insertVideo(db: D1Database, video: Video): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO videos (id, video_id, title, description, channel_name, channel_id, thumbnail_url, published_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      video.id,
      video.video_id,
      video.title,
      video.description,
      video.channel_name,
      video.channel_id,
      video.thumbnail_url,
      video.published_at,
      video.fetched_at
    )
    .run();
}

export async function getVideos(
  db: D1Database,
  opts: { channel?: string; page?: number; limit?: number } = {}
): Promise<{ videos: Video[]; total: number; page: number; pages: number }> {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(50, Math.max(1, opts.limit || 12));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.channel) {
    conditions.push('channel_name = ?');
    params.push(opts.channel);
  }

  const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

  const countResult = await db
    .prepare('SELECT COUNT(*) as total FROM videos' + where)
    .bind(...params)
    .first<{ total: number }>();
  const total = countResult?.total || 0;

  const listResult = await db
    .prepare('SELECT * FROM videos' + where + ' ORDER BY published_at DESC LIMIT ? OFFSET ?')
    .bind(...params, limit, offset)
    .all<Video>();

  return {
    videos: listResult.results,
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

export async function getVideoChannelNames(db: D1Database): Promise<string[]> {
  const result = await db
    .prepare('SELECT DISTINCT channel_name FROM videos ORDER BY channel_name')
    .all<{ channel_name: string }>();
  return result.results.map((r) => r.channel_name);
}

export async function getLatestVideos(db: D1Database, limit: number = 4): Promise<Video[]> {
  const result = await db
    .prepare('SELECT * FROM videos ORDER BY published_at DESC LIMIT ?')
    .bind(limit)
    .all<Video>();
  return result.results;
}

export async function deleteOldVideos(db: D1Database, daysOld: number = 30): Promise<void> {
  const cutoff = new Date(Date.now() - daysOld * 86400000).toISOString();
  await db.prepare('DELETE FROM videos WHERE published_at < ?').bind(cutoff).run();
}

export async function getTodayArticles(db: D1Database): Promise<Article[]> {
  const today = new Date().toISOString().slice(0, 10);
  const result = await db
    .prepare("SELECT * FROM articles WHERE published_at >= ? || 'T00:00:00.000Z' ORDER BY published_at DESC")
    .bind(today)
    .all<Article>();
  return result.results;
}
