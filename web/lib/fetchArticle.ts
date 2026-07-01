// Server-side article fetcher. Two tiers, auto-adapting per site:
//   1. plain fetch + cookie  -> Readability  (SSR sites; cheap)
//   2. headless Chromium + cookie             (JS-rendered sites)
// Tier 2 is only attempted when a renderer service is configured
// (NEWSHUB_RENDERER_URL), so slim deployments never need Chromium.

import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { sanitizeArticleHtml } from "./sanitizeHtml";
import { htmlToText } from "./miniflux";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// A plain fetch shorter than this is treated as a stub -> try the renderer.
const STUB_TEXT = 400;
// Anything below this even after rendering isn't worth storing.
const MIN_TEXT = 200;

export interface FetchedArticle {
  html: string;
  title: string;
  byline: string;
  siteName: string;
  textLength: number;
  via: "fetch" | "render";
}

function blockedHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h === "::1" ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^169\.254\./.test(h)
  );
}

function extract(html: string, url: string, via: FetchedArticle["via"]): FetchedArticle | null {
  const doc = new JSDOM(html, { url }).window.document;
  const parsed = new Readability(doc).parse();
  if (!parsed || !parsed.content) return null;
  const clean = sanitizeArticleHtml(parsed.content);
  return {
    html: clean,
    title: parsed.title ?? "",
    byline: parsed.byline ?? "",
    siteName: parsed.siteName ?? "",
    textLength: htmlToText(clean).length,
    via,
  };
}

async function tryFetch(url: string, cookie: string): Promise<FetchedArticle | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Cookie: cookie,
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "nb-NO,nb;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const html = await res.text();
  return extract(html, url, "fetch");
}

async function tryRender(rendererUrl: string, url: string, cookie: string): Promise<FetchedArticle | null> {
  let res: Response;
  try {
    res = await fetch(rendererUrl.replace(/\/+$/, "") + "/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, cookie }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { html?: string };
  if (!data.html) return null;
  return extract(data.html, url, "render");
}

export async function fetchArticle(url: string, cookie: string): Promise<FetchedArticle | null> {
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    host = u.hostname;
  } catch {
    return null;
  }
  if (blockedHost(host)) return null;

  const light = await tryFetch(url, cookie);
  if (light && light.textLength >= STUB_TEXT) return light;

  const rendererUrl = process.env.NEWSHUB_RENDERER_URL;
  if (rendererUrl) {
    const heavy = await tryRender(rendererUrl, url, cookie);
    if (heavy && heavy.textLength >= MIN_TEXT) return heavy;
  }

  // No renderer (or it failed): return the light result only if it's usable.
  return light && light.textLength >= MIN_TEXT ? light : null;
}
