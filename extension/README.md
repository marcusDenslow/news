# News Hub Capture (browser extension)

Unlocks full articles from sites **you already subscribe to**, inside your
self-hosted News Hub. Chromium MV3 (Chrome, Edge, Brave, Arc).

## Install (load unpacked)

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this `extension/` folder
3. Click the extension icon → set:
   - **Hub URL** — `http://localhost:3000`, or your server's URL (works remote)
   - **Capture token** — the `CAPTURE_TOKEN` from your hub's `.env`
   - **Save**

## Three actions

### Capture this page
On an article you're logged in to, extracts the full text (via
[Readability](https://github.com/mozilla/readability)) and sends it to the hub.
One-off, current tab.

### Auto-capture (continuous)
Enter your subscribed domains (`varden.no, aftenposten.no`) and an interval.
While the browser is open, the extension backfills new articles from those sites
automatically — opening each briefly in a background window, capturing, closing.
**Run now** does an immediate pass.

### Link this site (server-side)
Log into the site, then click this. The extension reads the site's cookies —
including the **httpOnly** session cookie that `document.cookie` can't see — and
hands them to the hub. Your hub then fetches that site **headlessly, no browser
needed**. The cookie is re-pushed periodically so it stays fresh.

## How your credentials are handled

- **Capture / Auto-capture:** the article is fetched in *your* session; only the
  extracted text leaves the browser. No cookie is ever sent.
- **Link this site:** the cookie is sent to *your own hub* and stored encrypted
  there. It never goes anywhere else.

## Notes

- `host_permissions` is `<all_urls>` so the extension can read articles on any
  publisher site and POST to whatever hub URL you configure. Fine for a
  side-loaded, self-hosted tool; narrow it (and expect review scrutiny) if you
  ever publish to a store.
- After editing extension files, reload it: `chrome://extensions` → **↻**.
- `vendor/Readability.js` is from `@mozilla/readability` (Apache-2.0).
- Only capture content you're entitled to.
