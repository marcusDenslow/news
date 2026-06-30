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

function pickImage(entry: RawEntry): string | null {
  for (const enc of entry.enclosures ?? []) {
    const url = enc.url ?? "";
    if (!url) continue;
    const mime = enc.mime_type ?? "";
    if (mime.startsWith("image/")) return url;
    if (IMG_EXT.test(url)) return url; // Miniflux often reports image/octet-stream
  }
  const content = entry.content ?? "";
  // Prefer the largest candidate in a srcset, else the first <img src>.
  const srcset = content.match(/<img[^>]+srcset=["']([^"']+)["']/i);
  if (srcset) {
    const last = srcset[1].split(",").map((s) => s.trim().split(/\s+/)[0]).filter(Boolean).pop();
    if (last && /^https?:\/\//.test(last)) return last;
  }
  const m = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m && /^https?:\/\//.test(m[1])) return m[1];
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

function excerptOf(html: string, max = 240): string {
  const text = htmlToText(html);
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
  return mf<{ feed_id: number }>("/feeds", {
    method: "POST",
    body: JSON.stringify({ feed_url: feedUrl, category_id: cat }),
  });
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

  const cats = [...byCategory.values()]
    .filter((c) => c.feeds.length > 0)
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
