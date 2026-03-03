-- Wipe all articles so they re-fetch with the fixed parser.
-- The cron runs every 15 minutes and will repopulate clean data.
DELETE FROM articles;
