ALTER TABLE articles ADD COLUMN slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);
