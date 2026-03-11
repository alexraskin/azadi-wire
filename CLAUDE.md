# CLAUDE.md — Azadi Wire

This file provides guidance for AI assistants working on the Azadi Wire codebase.

## Project Overview

**Azadi Wire** is an English-language news aggregator focused on Iran coverage. It aggregates articles from 24 independent news sources (21 RSS + 3 YouTube channels), categorizes them by topic using AI, and delivers a daily email digest to subscribers.

**Live site**: https://azadiwire.org

### Tech Stack

| Layer | Technology |
|---|---|
| Framework | Astro 5 (SSR mode) |
| Runtime | Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| AI | Cloudflare Workers AI (Llama 3.3 70B via AI Gateway) |
| Email | Resend |
| Deployment | Wrangler CLI |

---

## Repository Structure

```
azadi-wire/
├── src/
│   ├── layouts/          # Shared Astro layouts
│   ├── pages/
│   │   ├── api/          # REST API endpoints
│   │   └── *.astro       # Frontend pages
│   ├── lib/
│   │   ├── db.ts         # D1 database helpers
│   │   ├── types.ts      # TypeScript interfaces & constants
│   │   ├── time.ts       # Date formatting utilities
│   │   ├── resend.ts     # Email service client
│   │   └── fetcher/      # Article fetching pipeline
│   │       ├── index.ts      # Orchestrator
│   │       ├── rss.ts        # RSS/Atom parsing
│   │       ├── scraper.ts    # HTML scraping
│   │       ├── categorizer.ts # AI topic classification
│   │       ├── dedup.ts      # Deduplication logic
│   │       ├── digest.ts     # Daily AI digest generation
│   │       └── youtube.ts    # YouTube feed parsing
│   ├── middleware.ts      # Security headers & CORS middleware
│   ├── scripts/          # Client-side scripts (bookmarks.ts)
│   └── styles/           # Global CSS (light/dark mode)
├── migrations/           # D1 SQL migrations (sequential, numbered)
├── scripts/
│   └── patch-worker.mjs  # Post-build: injects scheduled() cron handler
├── public/               # Static assets (favicons, manifest, robots.txt)
├── astro.config.mjs      # Astro + Cloudflare adapter config
├── wrangler.jsonc        # Cloudflare Workers config (D1, AI, cron)
├── tsconfig.json         # TypeScript config
└── package.json          # Scripts and dependencies
```

---

## Development Commands

```bash
npm install               # Install dependencies
npm run dev               # Start local Astro dev server (no Workers bindings)
npm run preview           # Build + run locally with Wrangler (full Workers env)
npm run build             # Astro build + patch worker for cron
npm run deploy            # Build + deploy to production via Wrangler
npm run cf-typegen        # Regenerate Cloudflare Workers type bindings
npm run migrate           # Apply migrations to remote D1 database
npm run migrate-local     # Apply migrations to local D1 database
```

**Use `npm run preview` for testing anything that uses D1, AI, or other Workers bindings.** `npm run dev` alone won't have access to these Cloudflare-specific APIs.

---

## Environment & Configuration

### Cloudflare Bindings (wrangler.jsonc)

| Binding | Type | Purpose |
|---|---|---|
| `DB` | D1 Database | SQLite database (`azadi-wire-db`) |
| `AI` | Workers AI | Llama 3.3 70B for categorization & digests |
| `ASSETS` | Assets | Static file serving |

### Environment Variables / Secrets

| Variable | Type | Purpose |
|---|---|---|
| `RESEND_API_KEY` | Secret | Resend email API key |
| `RESEND_AUDIENCE_ID` | Var | Resend audience ID for newsletter |
| `RESEND_FROM_EMAIL` | Var | Sender address for digests |
| `CRON_SECRET` | Secret | Auth token for `/api/cron` and `/api/status` |

For local development, define these in `.dev.vars` (gitignored):

```
RESEND_API_KEY=re_...
RESEND_AUDIENCE_ID=...
RESEND_FROM_EMAIL=digest@azadiwire.org
CRON_SECRET=your-secret-here
```

### Cron Schedule

The fetcher runs every 15 minutes via Cloudflare Cron Triggers (`*/15 * * * *`), dispatched to `/api/cron`. The daily digest is generated at 6 PM UTC.

---

## Database Schema

### Tables

**`articles`** — Aggregated news articles
- `id` TEXT PRIMARY KEY
- `title`, `summary`, `source_name`, `source_url`, `article_url` (UNIQUE)
- `thumbnail_url`, `published_at`, `fetched_at`
- `topic` TEXT (DEFAULT `'general'`, see topics below)
- `slug` TEXT UNIQUE (URL-safe title identifier)
- `importance_score` INTEGER (AI-rated 1-10, nullable; 10 = breaking news, 1 = routine)

**`sources`** — Configured news sources
- `id` TEXT PRIMARY KEY
- `name`, `url`, `type` (`'rss'` | `'scrape'` | `'youtube'`), `active` (0/1)

**`articles_fts`** — FTS5 virtual table for full-text search over `title` and `summary`

**`fetcher_runs`** — Execution history (started_at, finished_at, inserted, errors, duration_ms)

**`daily_digests`** — AI-generated daily summaries
- `id` TEXT PRIMARY KEY
- `digest_date` TEXT UNIQUE, `overall_summary` TEXT
- `topic_summaries` TEXT (JSON), `article_count` INTEGER
- `created_at` TEXT

**`videos`** — YouTube videos
- `id` TEXT PRIMARY KEY
- `video_id` TEXT UNIQUE, `title`, `description`
- `channel_name`, `channel_id`, `thumbnail_url`
- `published_at`, `fetched_at`

### Adding Migrations

Create a new numbered SQL file in `migrations/`:

```
migrations/0016_your_migration_name.sql
```

Apply locally:

```bash
npm run migrate-local
```

Apply to production:

```bash
npm run migrate
```

---

## Core Concepts

### Topics

Articles are classified into one of these topics (defined in `src/lib/types.ts`):

| Value | Label |
|---|---|
| `war` | War |
| `human_rights` | Human Rights |
| `politics` | Politics |
| `culture` | Culture |
| `protests` | Protests |
| `sanctions` | Sanctions |
| `general` | General |

### Article Lifecycle

1. Fetcher polls active sources every 15 minutes
2. New URLs are checked against existing `article_url` entries (URL dedup)
3. Titles are checked for similarity against recent articles (90% word-overlap threshold — see `src/lib/fetcher/dedup.ts`)
4. New articles are categorized by AI (Llama 3.3 70B) with keyword fallback
5. Articles older than 90 days and videos older than 30 days are automatically deleted

### Fetcher Pipeline (`src/lib/fetcher/index.ts`)

The main orchestrator:
1. Loads active sources from D1
2. Dispatches article sources to the appropriate parser (`rss.ts`, `scraper.ts`)
3. Fetches YouTube channels separately via `youtube.ts` and inserts videos
4. Deduplicates articles against recent entries in the DB
5. Categorizes uncategorized articles with AI
6. Inserts new articles and updates FTS index
7. At 6 PM UTC: generates and emails the daily digest
8. Deletes articles older than 90 days and videos older than 30 days
9. Records run metrics to `fetcher_runs`

### AI Categorization (`src/lib/fetcher/categorizer.ts`)

- **Primary**: Calls Cloudflare Workers AI with a structured prompt asking for one of the 7 topic values and an importance score (1-10)
- Returns both `topic` and `importance` in a single AI call (JSON response)
- **Fallback**: Keyword-based matching if AI is unavailable or returns an invalid response (importance is null in fallback)
- Always produces a valid topic from the allowed set

### Digest Generation (`src/lib/fetcher/digest.ts`)

- Selects today's articles grouped by topic
- Calls AI to generate a 5-sentence overall summary + per-topic summaries
- Formats as HTML email and sends via Resend to all subscribers
- Falls back to a simple article-list digest if AI is unavailable

---

## API Endpoints

All endpoints are in `src/pages/api/`.

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/articles` | GET | — | Paginated articles; supports `?topic=`, `?source=`, `?page=` |
| `/api/articles/:id` | GET | — | Single article by slug or numeric ID |
| `/api/topics` | GET | — | Topic list with article counts |
| `/api/sources` | GET | — | Active news sources |
| `/api/search` | GET | — | Full-text search; `?q=query` |
| `/api/status` | GET | CRON_SECRET | Fetcher run history |
| `/api/cron` | GET | CRON_SECRET | Manually trigger the fetcher |
| `/api/subscribe` | POST | — | Email subscription signup |
| `/api/unsubscribe` | GET/POST | — | Remove subscriber |
| `/feed.xml` | GET | — | RSS 2.0 feed (all articles) |
| `/top.xml` | GET | — | RSS feed of top stories (AI importance ≥ 5, last 72h) |
| `/sitemap-articles.xml` | GET | — | Dynamic sitemap for articles and digests |

Protected endpoints require `Authorization: Bearer <CRON_SECRET>` header.

---

## Adding a New News Source

1. Insert a row into the `sources` table via a new migration:

```sql
-- migrations/0016_add_new_source.sql
INSERT INTO sources (id, name, url, type, active) VALUES
  ('new-source-id', 'Source Name', 'https://example.com/feed.xml', 'rss', 1);
```

2. If the source requires HTML scraping instead of RSS, add its CSS selectors to `src/lib/fetcher/scraper.ts`.

3. Apply the migration and test locally with `npm run preview`.

---

## Frontend Pages

| Route | File | Description |
|---|---|---|
| `/` | `index.astro` | Main feed with topic/source filters, search, pagination |
| `/article/[slug]` | `article/[slug].astro` | Article detail page |
| `/digest` | `digest.astro` | Latest daily digest |
| `/digest/[date]` | `digest/[date].astro` | Historical digest archive |
| `/videos` | `videos.astro` | YouTube video gallery |
| `/sources` | `sources.astro` | List of active sources |
| `/subscribe` | `subscribe.astro` | Newsletter signup |
| `/bookmarks` | `bookmarks.astro` | Client-side bookmarked articles |
| `/about` | `about.astro` | About page |
| `/terms` | `terms.astro` | Terms of Service |
| `/rss` | `rss.astro` | RSS feeds documentation page |
| `/unsubscribe` | `unsubscribe.astro` | Newsletter unsubscribe page |
| `/404` | `404.astro` | Custom 404 error page |
| `/feed.xml` | `feed.xml.ts` | RSS feed (all articles) |
| `/top.xml` | `top.xml.ts` | Top stories RSS feed |
| `/sitemap-articles.xml` | `sitemap-articles.xml.ts` | Dynamic article/digest sitemap |

---

## Security Conventions

Defined in `src/middleware.ts`:

- **CORS**: POST requests restricted to `azadiwire.org` and `localhost` (exception: POST `/api/unsubscribe` allows one-click email unsubscribe without origin check)
- **CSP**: Content Security Policy allowing `'unsafe-inline'` for scripts and styles, images from HTTPS/data URIs
- **X-Frame-Options**: DENY (clickjacking protection)
- **X-Content-Type-Options**: nosniff
- **Referrer-Policy**: `strict-origin-when-cross-origin`
- **Permissions-Policy**: Explicitly denies camera, microphone, geolocation, payment
- **X-XSS-Protection**: `0` (disabled in favor of CSP)
- **API endpoints**: Tagged with `X-Robots-Tag: noindex`

When adding new API endpoints, ensure they are included in the noindex middleware logic if they should not be crawled.

---

## Code Conventions

- **Language**: TypeScript throughout; all files should be `.ts` or `.astro`
- **Module system**: ESM (`"type": "module"` in package.json)
- **Database access**: Always use the helpers in `src/lib/db.ts`; avoid raw D1 queries in page/API files
- **Types**: Define shared interfaces in `src/lib/types.ts`
- **Slugs**: Use `slugify()` from `src/lib/types.ts` for URL-safe article identifiers
- **Dates**: Use helpers from `src/lib/time.ts` (`relativeTime()`, `formatDate()`) for display
- **No test framework**: Currently no automated tests; verify changes manually with `npm run preview`
- **Styling**: All styles in `src/styles/global.css`; CSS custom properties used for light/dark theming

---

## Deployment

```bash
npm run deploy
```

This runs `astro build`, then `scripts/patch-worker.mjs` (injects the `scheduled()` cron handler into the compiled worker), then `wrangler deploy`.

The patch step is required because Astro does not natively support Cloudflare's `scheduled()` export for cron triggers. The script appends the handler to the built worker bundle.
