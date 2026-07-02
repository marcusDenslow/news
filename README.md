# News Hub

A self-hosted news reader with a clean editorial UI — and **full articles from the
sites you already pay for**, without the server ever holding your logins by default.

RSS readers normally show you the teaser of a paywalled article and stop there,
even when you have a subscription. News Hub fixes that two ways, and you can use
either (or both):

- **Browser extension** — captures the full article inside your own logged-in
  browser session. The server never sees a publisher cookie. Great for desktops.
- **Server-side headless fetch** — you hand the hub your site cookie once
  (one click from the extension, or the CLI); a worker then fetches new articles
  with no browser open. Great for headless home servers.

Only read content you're entitled to. This is for your own paid subscriptions.

---

## How it works

```
                         ┌─────────────── Reader UI (Next.js) ───────────────┐
Free RSS ─► Miniflux ─────►  shows captured full text when present,          │
                         │   otherwise the feed summary / Miniflux scraper    │
                         └───────────────────────▲────────────────────────────┘
                                                 │ capture store (/data, per-user)
                  ┌──────────────────────────────┴───────────────────────────┐
   MODE A         │                                          MODE B           │
   Browser        │                                          Server-side      │
   extension      │                                          worker (in Docker)
   (your session) │                                          (uses stored cookie)
   Readability ───┘                                          fetch ─► Readability
                                                             └► Chromium fallback
                                                                (optional, JS sites)
```

- **`web/`** — Next.js reader + API. Proxies Miniflux, stores/serves captured
  full text, runs the server-side backfill worker (`instrumentation.ts`).
- **`extension/`** — Chromium (MV3) extension: capture pages and/or link a site's
  cookie to the hub.
- **`renderer/`** — optional headless Chromium service for JS-rendered paywalls.
- **`cli/newshub`** — terminal tool to manage server-side cookies (no browser).
- **Miniflux** — the feed engine (free feeds, server-side polling).

---

## Quick start

Requires Docker + Docker Compose.

```bash
git clone https://github.com/marcusDenslow/news.git && cd news
./setup.sh
```

`setup.sh` generates the secrets once, starts Postgres + Miniflux, mints the
Miniflux API token automatically, and builds the reader — no manual editing, no
`sed`, no token copying. It's idempotent (safe to re-run), and prints the reader
URL and your capture token when it finishes.

Want to change the Miniflux admin login first? Set `ADMIN_USERNAME` /
`ADMIN_PASSWORD` in `.env` before the first run.

- Reader: <http://localhost:3000> (or `http://SERVER_IP:3000`)
- Add feeds with the **+** in the reader, or in Miniflux.

That's the base install — free feeds work immediately. For paywalled full text,
pick a mode below.

---

## The browser extension

Load it unpacked (works in Chrome, Edge, Brave, Arc):

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select the `extension/` folder
3. Click the extension → set **Hub URL** (`http://localhost:3000`, or your server's
   URL) and **Capture token** (`CAPTURE_TOKEN` from `.env`) → **Save**

It works against a remote hub too — install it on your laptop, point Hub URL at
`https://news.yourserver.tld`, and it drives your headless server.

Three actions in the popup:

| Action | What it does |
|---|---|
| **Capture this page** | Grabs the full article from the current tab (you logged in). One-off. |
| **Auto-capture** | While the browser is open, backfills new articles from your listed domains automatically, in a background window. |
| **Link this site** | Reads the site's cookie (incl. httpOnly) and hands it to the hub, so the **server** fetches it headlessly. Auto-refreshed to stay valid. |

For a desktop you keep open, **Auto-capture** is enough. For a headless server,
use **Link this site** once, then the server takes over.

---

## Server-side (headless) mode

No browser needed at read time. Opt-in — enabled only when you set an encryption
key for the stored cookies.

```bash
# in .env:
NEWSHUB_SECRET_KEY=<openssl rand -hex 32>    # turns the server-side worker on
docker compose up -d --build web
```

Then give the hub a subscription cookie for a domain — either:

- **Extension:** log into the site, click **Link this site**. Easiest.
- **CLI** (see below), from any machine with `curl`.

The worker polls your cookie-domains every `NEWSHUB_BACKFILL_MIN` minutes
(default 15), fetches new articles with the cookie, extracts, and stores them.

### JS-rendered paywalls

If a site only reveals the article after JavaScript runs, a plain fetch gets a
stub. Enable the optional Chromium renderer and the worker falls back to it
per-article (SSR sites still use the cheap path):

```bash
# in .env:
NEWSHUB_RENDERER_URL=http://renderer:4000
docker compose --profile heavy up -d --build
```

The renderer image is ~1 GB, so it's off by default — enable only if you need it.

---

## CLI (headless setup, no extension)

`cli/newshub` is pure POSIX sh + `curl`. Use it on a terminal-only server, or on
your laptop pointed at a remote hub.

```bash
./cli/newshub config http://localhost:3000 <CAPTURE_TOKEN>

# get the cookie from any browser where you're logged into the site:
#   DevTools (F12) -> Network -> reload -> click the document request ->
#   Request Headers -> copy the whole "Cookie:" value, then:
pbpaste | ./cli/newshub set-cookie varden.no        # macOS
./cli/newshub set-cookie varden.no < cookie.txt     # from a file

./cli/newshub list          # show linked domains
./cli/newshub rm varden.no  # stop fetching a site
```

(Symlink it onto your PATH if you like: `ln -s "$PWD/cli/newshub" /usr/local/bin/newshub`.)

---

## Configuration (`.env`)

| Variable | Required | Purpose |
|---|---|---|
| `MINIFLUX_TOKEN` | yes | Miniflux API token (Settings → API Keys). |
| `CAPTURE_TOKEN` | yes | Shared secret the extension/CLI present to the hub. |
| `NEWSHUB_SECRET_KEY` | no | Enables server-side mode; encrypts stored cookies (AES-256-GCM). |
| `NEWSHUB_RENDERER_URL` | no | `http://renderer:4000` to use the Chromium renderer. |
| `NEWSHUB_BACKFILL_MIN` | no | Minutes between server-side passes (default 15, min 5). |

---

## Security & legal

- **Credentials.** In the default (extension) mode the server stores **no**
  publisher credentials — capture happens in your browser. Server-side mode stores
  **one cookie per site**, encrypted at rest with `NEWSHUB_SECRET_KEY`, and is
  opt-in. Never stores publisher passwords.
- **Blast radius.** A stored cookie is a session token, not a password. Keep your
  `.env` and the `captures`/cookies volume private; back them up encrypted.
- **Access.** Exposing the hub to family/friends? Prefer Tailscale/WireGuard over a
  public port, and put TLS in front.
- **Scope.** This is a tool for reading subscriptions **you pay for**. Don't
  redistribute paid content; captures are per-user and not shared between accounts.
  Automated fetching is rate-limited and jittered to stay polite.

---

## License

Add a `LICENSE` before publishing — **AGPL-3.0** is recommended for a self-hosted
app (keeps hosted forks open). `extension/vendor/Readability.js` is from
[`@mozilla/readability`](https://github.com/mozilla/readability) (Apache-2.0).
