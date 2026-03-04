CREATE TABLE IF NOT EXISTS daily_digests (
  id TEXT PRIMARY KEY,
  digest_date TEXT NOT NULL UNIQUE,
  overall_summary TEXT NOT NULL,
  topic_summaries TEXT NOT NULL,
  article_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_digests_date ON daily_digests(digest_date DESC);
