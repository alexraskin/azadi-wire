import type { Article, Source, TopicCount, Topic } from './types';

type D1Database = {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
};

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
  opts: { topic?: string; page?: number; limit?: number } = {}
): Promise<{ articles: Article[]; total: number; page: number; pages: number }> {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, Math.max(1, opts.limit || 20));
  const offset = (page - 1) * limit;

  let countQuery = 'SELECT COUNT(*) as total FROM articles';
  let listQuery = 'SELECT * FROM articles';
  const params: unknown[] = [];

  if (opts.topic && opts.topic !== 'all') {
    countQuery += ' WHERE topic = ?';
    listQuery += ' WHERE topic = ?';
    params.push(opts.topic);
  }

  listQuery += ' ORDER BY published_at DESC LIMIT ? OFFSET ?';

  const countStmt = opts.topic && opts.topic !== 'all'
    ? db.prepare(countQuery).bind(opts.topic)
    : db.prepare(countQuery);

  const countResult = await countStmt.first<{ total: number }>();
  const total = countResult?.total || 0;

  const listParams = [...params, limit, offset];
  let listStmt = db.prepare(listQuery);
  for (const p of listParams) {
    listStmt = listStmt.bind(...listParams);
    break;
  }

  const listResult = await db.prepare(listQuery).bind(...listParams).all<Article>();

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
      `INSERT OR IGNORE INTO articles (id, title, summary, source_name, source_url, article_url, thumbnail_url, published_at, fetched_at, topic)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      article.id,
      article.title,
      article.summary,
      article.source_name,
      article.source_url,
      article.article_url,
      article.thumbnail_url,
      article.published_at,
      article.fetched_at,
      article.topic
    )
    .run();
}

export async function deleteOldArticles(db: D1Database, daysOld: number = 90): Promise<void> {
  const cutoff = new Date(Date.now() - daysOld * 86400000).toISOString();
  await db.prepare('DELETE FROM articles WHERE published_at < ?').bind(cutoff).run();
}
