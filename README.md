# Azadi Wire

English-language news aggregator focused on Iran. Pulls articles from multiple independent sources, categorizes them by topic using AI

Live at [azadiwire.org](https://azadiwire.org)

## Project Structure

```
src/
  layouts/
    Base.astro              # Shared HTML shell
  pages/
    index.astro             # Feed with topic + source filters
    about.astro             # Static about page
    sources.astro           # List of active sources
    terms.astro             # Terms of service
    digest.astro            # Latest daily AI digest
    digest/[date].astro     # Archived digest by date
    article/[slug].astro    # Article detail page
    api/
      articles.ts           # GET /api/articles
      articles/[id].ts      # GET /api/articles/:id
      topics.ts             # GET /api/topics
      sources.ts            # GET /api/sources
      search.ts             # GET /api/search
      status.ts             # GET /api/status
      feed.xml.ts           # GET /feed.xml
      cron.ts               # GET /api/cron (fetcher trigger)
  lib/
    db.ts                   # D1 query helpers + read/write session wrappers
    time.ts                 # Relative time formatting
    types.ts                # TypeScript interfaces
    fetcher/
      index.ts              # Orchestrator
      rss.ts                # RSS/Atom feed parser
      scraper.ts            # HTML scraper (per-source selectors)
      categorizer.ts        # AI-powered topic classification (keyword fallback)
      dedup.ts              # Title similarity deduplication
      digest.ts             # Daily AI digest generation
  styles/
    global.css              # All styles, light + dark mode
migrations/
  0001_initial.sql          # Schema + seed sources
  ...
  0013_add_daily_digests.sql
scripts/
  patch-worker.mjs          # Adds scheduled() handler to build output
```

## Setup

```bash
npm install
```

### Create the D1 database

```bash
wrangler d1 create azadi-wire-db
```

Copy the `database_id` from the output into `wrangler.jsonc`.

### Run migrations

```bash
# Remote
wrangler d1 migrations apply azadi-wire-db

# Local
wrangler d1 migrations apply azadi-wire-db --local
```

### Development

```bash
npm run dev
```

### Build and preview locally

```bash
npm run preview
```

### Deploy

```bash
npm run deploy
```

## How It Works

A cron trigger runs every 15 minutes. It:

1. Reads all active sources from the `sources` table
2. Fetches RSS feeds (or scrapes HTML for scrape-type sources)
3. Extracts title, summary, URL, thumbnail, and publish date
4. Classifies each article into a topic (war, human rights, politics, culture, protests, sanctions, or general) using Cloudflare Workers AI via AI Gateway, falling back to keyword matching if the AI is unavailable
5. Deduplicates by URL and by title similarity (90% threshold)
6. Inserts new articles into D1
7. Deletes articles older than 90 days
8. Generates a daily AI digest summarizing top stories by topic (once per day)

## Sources

- Iran International
- BBC News Iran
- Al Jazeera Iran
- Reuters Iran
- Radio Farda
- IranWire
- Center for Human Rights in Iran
- The Guardian
- Middle East Eye
- VOA News Iran
- Amnesty International
- Pars Today
- UN News Middle East
- HRANA (Human Rights Activists News Agency)
- Tasnim News Agency
- Iranian.com
- Iran News Daily
- Iran Herald
- New York Times Iran
- Iran Times
- The Iran Primer (USIP)
- Iran Front Page

## API

| Endpoint | Description |
| :--- | :--- |
| `GET /api/articles?topic=&source=&page=&limit=` | Paginated article list |
| `GET /api/articles/:id` | Single article |
| `GET /api/topics` | Topics with article counts |
| `GET /api/sources` | Active sources |
| `GET /api/search?q=` | Full-text search |
| `GET /api/status` | Fetcher run history |
| `GET /api/cron` | Manually trigger the fetcher |
| `GET /feed.xml` | RSS feed |

## License

unlicense
