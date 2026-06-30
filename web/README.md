# News — an Apple News–style reader for Miniflux

A self-hosted, card-based news reader UI built on top of a [Miniflux](https://miniflux.app)
backend. Miniflux does the feed fetching, parsing, and storage; this app is a clean,
animated reading experience inspired by Apple News — editorial cards, a lead story,
and a full-screen article reader with a card→article morph.

![stack](https://img.shields.io/badge/Next.js-16-black) ![react](https://img.shields.io/badge/React-19-blue)

## Features

- **Editorial card stream** — a full-width lead story plus a responsive masonry of
  cards. Stories with images get image cards; text-only stories get compact cards with
  a per-source accent color.
- **Full-screen reader** — tap a card and its image morphs into a full article view
  (Framer Motion shared-layout). Serif typography, reading-progress bar, and a
  one-tap **Read full article** that pulls the complete text via Miniflux's scraper.
- **Browse & manage** — Today / Unread / Bookmarks, channels and per-feed views,
  live search, bookmark (star), mark-as-read on open, add feeds, manual refresh.
- **Polish** — light/dark themes (system-aware), smooth entrance animations,
  graceful image fallbacks, optimistic updates, infinite scroll.

## Architecture

The Miniflux API token never reaches the browser. The Next.js app exposes a thin
backend-for-frontend under `app/api/*` that proxies Miniflux and enriches entries
(extracts a hero image, builds an excerpt, derives the source domain):

```
Browser ──► /api/*  (Next route handlers, server-only token)
                │
                └──► Miniflux REST API (X-Auth-Token)
```

| Route | Purpose |
| --- | --- |
| `GET /api/entries` | Paged, filtered, enriched entry list |
| `GET /api/entries/[id]` | Single entry with full content |
| `GET /api/entries/[id]/fulltext` | Scraped full article (Miniflux fetch-content) |
| `PUT /api/entries/[id]/status` | Mark read / unread |
| `PUT /api/entries/[id]/star` | Toggle bookmark |
| `GET /api/feeds` · `POST /api/feeds` | Sidebar tree (with unread counts) · add feed |
| `GET /api/icon/[feedId]` | Feed favicon (decoded bytes) |
| `GET /api/img?url=` | Image proxy (SSRF-guarded, hotlink-friendly) |
| `POST /api/refresh` | Refresh all feeds |

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · Tailwind v4 ·
shadcn/ui (Radix) · Framer Motion · SWR · next-themes · lucide-react.

## Getting started

Requires **Node 20.9+** and **Docker** (for Miniflux).

```bash
# 1. Start Miniflux + Postgres (from the repo root)
docker compose up -d

# 2. Create an API token in Miniflux
#    Open http://localhost:8080  (admin / changeme123 — see docker-compose.yml)
#    Settings → API Keys → Create, then put it in web/.env.local:
#
#    MINIFLUX_URL=http://localhost:8080
#    MINIFLUX_TOKEN=<your token>

# 3. Run the UI
cd web
npm install
npm run dev          # http://localhost:3000
```

Add feeds from the **＋** button in the sidebar (paste an RSS/Atom or site URL).

### Production

```bash
npm run build
npm run start        # serves the optimized build
```

## Notes

- `.env.local` holds the Miniflux URL + token and is read server-side only.
- Article and favicon images are streamed through `/api/img` and `/api/icon` so the
  browser never hotlinks third-party hosts directly.
- `@mozilla/readability` / `jsdom` are present from the initial scaffold but unused —
  full-text extraction is delegated to Miniflux's built-in scraper.
