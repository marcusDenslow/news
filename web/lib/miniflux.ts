// Server-only Miniflux REST client + entry enrichment.
// Never import this from a Client Component — it holds the API token.

import type {
  RawEntry,
  RawFeed,
  Category,
  Counters,
  CardEntry,
  FullEntry,
  FeedsTree,
  CategoryNode,
} from "./types";

const BASE = (process.env.MINIFLUX_URL ?? "http://localhost:8080").replace(/\/$/, "");
const TOKEN = process.env.MINIFLUX_TOKEN ?? "";

async function mf<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/v1${path}`, {
    ...init,
    headers: {
      "X-Auth-Token": TOKEN, // NB: hyphen, not underscore
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`miniflux ${res.status} ${path}: ${body.slice(0, 200)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ----------------------------- enrichment ------------------------------ */

const IMG_EXT = /\.(jpe?g|png|webp|gif|avif|bmp|tiff?)(\?|#|$)/i;

// URLs whose params are signed (HMAC/token) must not be edited — doing so
// invalidates the signature and the CDN rejects the request.
const SIGNED_PARAMS = ["s", "sig", "signature", "hmac", "token", "st", "exp", "expires"];

// Many feeds hand us a tiny thumbnail (e.g. ?width=140). For *unsigned* CDN URLs
// we can request a larger render by bumping the width param.
function boostImage(url: string): string {
  // BBC ichef encodes width in the path (unsigned): /ace/standard/240/cpsprodpb/...
  if (/ichef\.bbci\.co\.uk/.test(url)) {
    return url.replace(/(\/(?:standard|ws|news|amz)\/)\d{2,4}(\/)/, "$1800$2");
  }
  try {
    const u = new URL(url);
    if (SIGNED_PARAMS.some((k) => u.searchParams.has(k))) return url;
    let touched = false;
    for (const k of ["width", "w", "maxwidth", "fit-width"]) {
      if (u.searchParams.has(k)) {
        const cur = Number(u.searchParams.get(k));
        if (!cur || cur < 1280) u.searchParams.set(k, "1280");
        touched = true;
      }
    }
    for (const k of ["height", "h", "resize"]) u.searchParams.delete(k);
    if (touched && u.searchParams.has("quality")) u.searchParams.set("quality", "80");
    return u.toString();
  } catch {
    return url;
  }
}

// Rough pixel-width hint so we can prefer the biggest signed render a feed offers.
function widthHint(url: string): number {
  const q = url.match(/[?&](?:width|w)=(\d{2,5})/i);
  if (q) return Number(q[1]);
  const wh = url.match(/\/(\d{3,5})x\d{3,5}\//);
  if (wh) return Number(wh[1]);
  const n = url.match(/\/(\d{3,5})\.(?:jpe?g|png|webp|avif)/i);
  if (n) return Number(n[1]);
  return 0;
}

function pickImage(entry: RawEntry): string | null {
  const candidates = (entry.enclosures ?? []).filter((enc) => {
    const url = enc.url ?? "";
    const mime = enc.mime_type ?? "";
    return Boolean(url) && (mime.startsWith("image/") || IMG_EXT.test(url));
  });
  if (candidates.length) {
    // Prefer the largest render the feed already offers (each is validly signed).
    candidates.sort((a, b) => widthHint(b.url) - widthHint(a.url));
    return boostImage(candidates[0].url);
  }

  const content = entry.content ?? "";
  const srcset = content.match(/<img[^>]+srcset=["']([^"']+)["']/i);
  if (srcset) {
    const last = srcset[1].split(",").map((s) => s.trim().split(/\s+/)[0]).filter(Boolean).pop();
    if (last && /^https?:\/\//.test(last)) return boostImage(last);
  }
  const m = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m && /^https?:\/\//.test(m[1])) return boostImage(m[1]);
  return null;
}

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&#39;": "'", "&apos;": "'", "&rsquo;": "’", "&lsquo;": "‘",
  "&ldquo;": "“", "&rdquo;": "”", "&hellip;": "…",
  "&mdash;": "—", "&ndash;": "–",
};

export function htmlToText(html: string): string {
  return (html ?? "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Strip link-dump boilerplate that some feeds (e.g. Hacker News) put in content.
function cleanExcerpt(text: string): string {
  return text
    .replace(/Article URL:\s*\S+/gi, "")
    .replace(/Comments URL:\s*\S+/gi, "")
    .replace(/Points:\s*\d+/gi, "")
    .replace(/#\s*Comments:\s*\d+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function excerptOf(html: string, max = 240): string {
  const text = cleanExcerpt(htmlToText(html));
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + "…";
}

function domainOf(entry: RawEntry): string {
  const candidate = entry.feed?.site_url || entry.url || "";
  try {
    return new URL(candidate).hostname.replace(/^www\./, "");
  } catch {
    return entry.feed?.title ?? "";
  }
}

function toCard(entry: RawEntry): CardEntry {
  return {
    id: entry.id,
    title: entry.title,
    url: entry.url,
    author: entry.author ?? "",
    publishedAt: entry.published_at,
    readingTime: entry.reading_time ?? 0,
    starred: entry.starred ?? false,
    status: entry.status,
    feedId: entry.feed_id,
    feedTitle: entry.feed?.title ?? domainOf(entry),
    domain: domainOf(entry),
    image: pickImage(entry),
    excerpt: excerptOf(entry.content ?? ""),
  };
}

function toFull(entry: RawEntry): FullEntry {
  return { ...toCard(entry), content: entry.content ?? "", commentsUrl: entry.comments_url ?? "" };
}

/* ------------------------------- queries ------------------------------- */

export interface ListParams {
  status?: string;
  starred?: boolean;
  categoryId?: number;
  feedId?: number;
  search?: string;
  today?: boolean;
  limit?: number;
  offset?: number;
}

export async function listEntries(p: ListParams): Promise<{ total: number; entries: CardEntry[] }> {
  const qs = new URLSearchParams({
    order: "published_at",
    direction: "desc",
    limit: String(p.limit ?? 30),
    offset: String(p.offset ?? 0),
  });
  if (p.status && p.status !== "all") qs.set("status", p.status);
  if (p.starred) qs.set("starred", "true");
  if (p.search) qs.set("search", p.search);
  if (p.today) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    qs.set("published_after", String(Math.floor(d.getTime() / 1000)));
  }

  let base = "/entries";
  if (p.feedId) base = `/feeds/${p.feedId}/entries`;
  else if (p.categoryId) base = `/categories/${p.categoryId}/entries`;

  const data = await mf<{ total: number; entries: RawEntry[] }>(`${base}?${qs.toString()}`);
  return { total: data.total, entries: (data.entries ?? []).map(toCard) };
}

export async function getEntry(id: number): Promise<FullEntry> {
  return toFull(await mf<RawEntry>(`/entries/${id}`));
}

export async function listFeeds(): Promise<{ id: number; siteUrl: string; feedUrl: string; title: string }[]> {
  const feeds = await mf<RawFeed[]>("/feeds");
  return feeds.map((f) => ({ id: f.id, siteUrl: f.site_url, feedUrl: f.feed_url, title: f.title }));
}

export async function setStatus(ids: number[], status: "read" | "unread"): Promise<void> {
  await mf<void>("/entries", {
    method: "PUT",
    body: JSON.stringify({ entry_ids: ids, status }),
  });
}

export async function toggleStar(id: number): Promise<void> {
  await mf<void>(`/entries/${id}/bookmark`, { method: "PUT" });
}

export async function fetchFullContent(id: number): Promise<string> {
  const data = await mf<{ content: string }>(`/entries/${id}/fetch-content`);
  return data.content ?? "";
}

export async function refreshAll(): Promise<void> {
  await mf<void>("/feeds/refresh", { method: "PUT" });
}

export async function createFeed(feedUrl: string, categoryId?: number): Promise<{ feed_id: number }> {
  let cat = categoryId;
  if (!cat) {
    const cats = await mf<Category[]>("/categories");
    cat = cats[0]?.id ?? 1;
  }
  const create = (url: string) =>
    mf<{ feed_id: number }>("/feeds", {
      method: "POST",
      body: JSON.stringify({ feed_url: url, category_id: cat }),
    });

  const isDup = (e: unknown) => /already exists/i.test(String(e));

  try {
    // Works when the user pasted an actual feed URL.
    return await create(feedUrl);
  } catch (directErr) {
    if (isDup(directErr)) throw new Error("You’re already subscribed to that feed.");

    // Otherwise the URL is probably a site page — discover its feeds.
    let found: Array<{ url: string; title?: string }> = [];
    try {
      found = await mf<Array<{ url: string; title?: string }>>("/discover", {
        method: "POST",
        body: JSON.stringify({ url: feedUrl }),
      });
    } catch {
      /* discovery itself failed (unreachable host, etc.) */
    }
    if (found?.length) {
      try {
        return await create(found[0].url);
      } catch (discoveredErr) {
        if (isDup(discoveredErr)) throw new Error("You’re already subscribed to that feed.");
        throw new Error("No RSS or Atom feed found at that address. Try the direct feed URL.");
      }
    }
    throw new Error("No RSS or Atom feed found at that address. Try the direct feed URL.");
  }
}

export async function createCategory(title: string): Promise<{ id: number; title: string }> {
  const cat = await mf<Category>("/categories", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  return { id: cat.id, title: cat.title };
}

export async function getFeedsTree(): Promise<FeedsTree> {
  const [feeds, categories, counters] = await Promise.all([
    mf<RawFeed[]>("/feeds"),
    mf<Category[]>("/categories"),
    mf<Counters>("/feeds/counters"),
  ]);

  const byCategory = new Map<number, CategoryNode>();
  for (const c of categories) {
    byCategory.set(c.id, { id: c.id, title: c.title, unread: 0, feeds: [] });
  }

  let totalUnread = 0;
  for (const f of feeds) {
    if (f.hide_globally) continue;
    const unread = counters.unreads?.[String(f.id)] ?? 0;
    totalUnread += unread;
    const node = byCategory.get(f.category.id);
    if (!node) continue;
    node.unread += unread;
    node.feeds.push({
      id: f.id,
      title: f.title,
      siteUrl: f.site_url,
      unread,
      errored: (f.parsing_error_count ?? 0) > 0,
    });
  }

  // Keep empty categories: an empty folder is still a valid drop target for the
  // sidebar's drag-to-move. Feeds are alpha-sorted as a default; the client then
  // applies any remembered drag order on top.
  const cats = [...byCategory.values()]
    .map((c) => ({ ...c, feeds: c.feeds.sort((a, b) => a.title.localeCompare(b.title)) }))
    .sort((a, b) => a.title.localeCompare(b.title));

  // starred count is not in counters; query lightweight total.
  let starred = 0;
  try {
    const s = await mf<{ total: number }>("/entries?starred=true&limit=1");
    starred = s.total;
  } catch {
    /* ignore */
  }

  return { totalUnread, starred, categories: cats };
}

export async function markAllRead(p: { feedId?: number; categoryId?: number }): Promise<void> {
  if (p.feedId) {
    await mf<void>(`/feeds/${p.feedId}/mark-all-as-read`, { method: "PUT" });
    return;
  }
  if (p.categoryId) {
    await mf<void>(`/categories/${p.categoryId}/mark-all-as-read`, { method: "PUT" });
    return;
  }
  // Global: mark every category as read.
  const cats = await mf<Category[]>("/categories");
  await Promise.all(
    cats.map((c) =>
      mf<void>(`/categories/${c.id}/mark-all-as-read`, { method: "PUT" }).catch(() => {})
    )
  );
}

export async function deleteFeed(feedId: number): Promise<void> {
  await mf<void>(`/feeds/${feedId}`, { method: "DELETE" });
}

// Move a feed into another category (folder). Miniflux has no per-feed sort
// order, so drag-reorder within a folder is a client concern (persisted in the
// browser); only the folder membership lives server-side.
export async function moveFeed(feedId: number, categoryId: number): Promise<void> {
  await mf<void>(`/feeds/${feedId}`, {
    method: "PUT",
    body: JSON.stringify({ category_id: categoryId }),
  });
}

export async function getIcon(feedId: number): Promise<{ mime: string; bytes: Buffer } | null> {
  try {
    const data = await mf<{ id: number; mime_type: string; data: string }>(`/feeds/${feedId}/icon`);
    // data.data looks like "image/png;base64,AAAA..."
    const comma = data.data.indexOf(",");
    const b64 = comma >= 0 ? data.data.slice(comma + 1) : data.data;
    return { mime: data.mime_type || "image/png", bytes: Buffer.from(b64, "base64") };
  } catch {
    return null;
  }
}
