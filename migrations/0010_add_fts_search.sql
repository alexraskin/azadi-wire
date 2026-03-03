CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
  title,
  summary,
  content='articles',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS articles_fts_ai AFTER INSERT ON articles BEGIN
  INSERT INTO articles_fts(rowid, title, summary)
  VALUES (new.rowid, new.title, new.summary);
END;

CREATE TRIGGER IF NOT EXISTS articles_fts_ad AFTER DELETE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, summary)
  VALUES ('delete', old.rowid, old.title, old.summary);
END;

CREATE TRIGGER IF NOT EXISTS articles_fts_au AFTER UPDATE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, summary)
  VALUES ('delete', old.rowid, old.title, old.summary);
  INSERT INTO articles_fts(rowid, title, summary)
  VALUES (new.rowid, new.title, new.summary);
END;

INSERT INTO articles_fts(rowid, title, summary)
  SELECT rowid, title, summary FROM articles;
