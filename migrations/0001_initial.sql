CREATE TABLE articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  source_name TEXT NOT NULL,
  source_url TEXT,
  article_url TEXT NOT NULL UNIQUE,
  thumbnail_url TEXT,
  published_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT 'general'
);

CREATE INDEX idx_articles_topic_published ON articles(topic, published_at DESC);
CREATE UNIQUE INDEX idx_articles_url ON articles(article_url);

CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

-- Seed initial sources
INSERT INTO sources (id, name, url, type, active) VALUES
  ('src-iran-intl', 'Iran International', 'https://www.iranintl.com/en/feed', 'rss', 1),
  ('src-bbc-iran', 'BBC News Iran', 'https://feeds.bbci.co.uk/news/topics/czp1erp4r9lt/rss.xml', 'rss', 1),
  ('src-aljazeera', 'Al Jazeera Iran', 'https://www.aljazeera.com/tag/iran/feed/rss', 'rss', 1),
  ('src-reuters-iran', 'Reuters Iran', 'https://www.reuters.com/arc/outboundfeeds/v4/search/tag:iran/?outputType=xml', 'rss', 1),
  ('src-radio-farda', 'Radio Farda', 'https://en.radiofarda.com/api/z-pqpevi-qpp', 'rss', 1),
  ('src-iranwire', 'IranWire', 'https://iranwire.com/en/feed/', 'rss', 1),
  ('src-chri', 'Center for Human Rights in Iran', 'https://iranhumanrights.org/feed/', 'rss', 1);
