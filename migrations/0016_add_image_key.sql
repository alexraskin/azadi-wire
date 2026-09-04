-- Key of the article thumbnail stored in R2 (bucket azadi-wire-cdn, prefix
-- thumbs/). NULL means the image was never stored, so the original
-- thumbnail_url is used instead.
ALTER TABLE articles ADD COLUMN image_key TEXT;
