ALTER TABLE articles ADD COLUMN importance_score INTEGER;
CREATE INDEX idx_articles_importance ON articles(importance_score DESC, published_at DESC);
