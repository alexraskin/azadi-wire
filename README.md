# Azadi Wire

English-language news aggregator focused on Iran. Pulls articles from multiple independent sources, categorizes them by topic, and presents them in a minimal, fast interface.

Live at [azadiwire.org](https://azadiwire.org)

## Stack

- **Astro** (SSR mode) for pages and API routes
- **Cloudflare Workers** for hosting
- **Cloudflare D1** (SQLite) for article storage
- **Cloudflare Workers AI** for article topic classification
- **Vanilla CSS** with dark mode support
- Zero client-side JavaScript — all filtering via query parameters

## Project Structure

```
src/
  layouts/
    Base.astro              # Shared HTML shell
  pages/
    index.astro             # Feed with topic + source filters
    about.astro             # Static about page
    sources.astro           # List of active sources
    article/[id].astro      # Article detail page
    api/
      articles.ts           # GET /api/articles
      articles/[id].ts      # GET /api/articles/:id
      topics.ts             # GET /api/topics
      sources.ts            # GET /api/sources
      cron.ts               # GET /api/cron (fetcher trigger)
  lib/
    db.ts                   # D1 query helpers
    time.ts                 # Relative time formatting
    types.ts                # TypeScript interfaces
    fetcher/
      index.ts              # Orchestrator
      rss.ts                # RSS/Atom feed parser
      scraper.ts            # HTML scraper (per-source selectors)
      categorizer.ts        # AI-powered topic classification (keyword fallback)
      dedup.ts              # Title similarity deduplication
  styles/
    global.css              # All styles, light + dark mode
migrations/
  0001_initial.sql          # Schema + seed sources
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
4. Classifies each article into a topic (war, human rights, politics, culture, protests, sanctions, or general) using Cloudflare Workers AI, falling back to keyword matching if the AI is unavailable
5. Deduplicates by URL and by title similarity (90% threshold)
6. Inserts new articles into D1
7. Deletes articles older than 10 days

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

## API

| Endpoint | Description |
| :--- | :--- |
| `GET /api/articles?topic=&source=&page=&limit=` | Paginated article list |
| `GET /api/articles/:id` | Single article |
| `GET /api/topics` | Topics with article counts |
| `GET /api/sources` | Active sources |
| `GET /api/cron` | Manually trigger the fetcher |

## License

unlicense
