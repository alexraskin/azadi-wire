CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  channel_name TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  thumbnail_url TEXT,
  published_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE INDEX idx_videos_published ON videos(published_at DESC);
CREATE INDEX idx_videos_channel ON videos(channel_name, published_at DESC);

INSERT OR IGNORE INTO sources (id, name, url, type, active) VALUES
  ('yt-iran-intl', 'Iran International', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCWUREZPvqB6L1MuDV5ngiiw', 'youtube', 1),
  ('yt-bbc-persian', 'BBC News Persian', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCQfwfsi5VrQ8yKZ-UWmAEFg', 'youtube', 1),
  ('yt-voa-farsi', 'VOA Farsi', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCttfDeGMwUxPjnlsKagcwKw', 'youtube', 1);
