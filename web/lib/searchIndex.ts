// Local fuzzy full-text search over the reader's articles — including the full
// text of host-captured (paywalled) articles that Miniflux never indexes.
//
// Miniflux's own search is exact-word and only sees feed content, so it misses
// partial words, typos, and every subscriber article captured by the extension.
// This builds a small in-memory corpus (recent entries for the active filter,
// each enriched with its captured body when present) and scores it with the
// dependency-free matcher in ./fuzzy.

import type { CardEntry, RawEntry } from "./types";
import { htmlToText, listRawEntries, toCard, type ListParams } from "./miniflux";
import { getCapture } from "./captureStore";
import { normalize, scoreDoc, tokenize, words, type DocFields } from "./fuzzy";

// Captures are stored host-wide under one key (see the fulltext route).
const DEFAULT_USER = "default";

// How many recent entries (per active filter) to pull into the search corpus.
// The whole set is scored in-memory on every query, so keep it bounded.
const CORPUS_CAP = 800;

// Reuse a built corpus across keystrokes / pagination. Short TTL so a freshly
// captured or refreshed article shows up quickly.
const TTL_MS = 30_000;
const CAPTURE_CONCURRENCY = 24;

// Cap on the deduped body vocabulary scanned for typo (edit-distance) matches.
// Bounds worst-case work on very long articles; substring matching still covers
// the whole body regardless.
const BODY_VOCAB_CAP = 4000;

function uniqueWords(normalized: string, cap: number): string[] {
  const seen = new Set<string>();
  for (const w of words(normalized)) {
    if (w.length >= 4) seen.add(w); // edit distance only kicks in for len >= 4
    if (seen.size >= cap) break;
  }
  return [...seen];
}

interface Doc extends DocFields {
  entry: CardEntry;
  publishedAt: number;
}

interface Corpus {
  docs: Doc[];
  at: number;
}

const cache = new Map<string, Corpus>();

function cacheKey(user: string, p: ListParams): string {
  return JSON.stringify([user, p.status ?? "", !!p.starred, p.categoryId ?? 0, p.feedId ?? 0, !!p.today]);
}

// Run `fn` over `items` with bounded concurrency (avoids opening hundreds of
// file descriptors at once when reading captures).
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function toDoc(raw: RawEntry): Promise<Doc> {
  const entry = toCard(raw);
  const cap = await getCapture(DEFAULT_USER, raw.url);
  const bodyHtml = cap?.html ?? raw.content ?? "";
  const title = normalize(entry.title);
  const meta = normalize([entry.author, entry.feedTitle, entry.domain].filter(Boolean).join(" "));
  const body = normalize(htmlToText(bodyHtml));
  return {
    entry,
    publishedAt: Date.parse(entry.publishedAt) || 0,
    title,
    titleWords: words(title),
    meta,
    metaWords: words(meta),
    body,
    bodyWords: uniqueWords(body, BODY_VOCAB_CAP),
  };
}

async function getCorpus(user: string, p: ListParams): Promise<Doc[]> {
  const key = cacheKey(user, p);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.docs;

  const { entries } = await listRawEntries({
    status: p.status,
    starred: p.starred,
    categoryId: p.categoryId,
    feedId: p.feedId,
    today: p.today,
    limit: CORPUS_CAP,
    offset: 0,
  });
  const docs = await mapLimit(entries, CAPTURE_CONCURRENCY, toDoc);
  cache.set(key, { docs, at: Date.now() });
  return docs;
}

export async function searchEntries(
  user: string,
  p: ListParams,
  query: string,
  limit: number,
  offset: number,
): Promise<{ total: number; entries: CardEntry[] }> {
  const tokens = tokenize(query);
  if (!tokens.length) return { total: 0, entries: [] };

  const docs = await getCorpus(user, p);
  const scored: { entry: CardEntry; score: number; publishedAt: number }[] = [];
  for (const d of docs) {
    const score = scoreDoc(tokens, d);
    if (score > 0) scored.push({ entry: d.entry, score, publishedAt: d.publishedAt });
  }
  scored.sort((a, b) => b.score - a.score || b.publishedAt - a.publishedAt);

  return {
    total: scored.length,
    entries: scored.slice(offset, offset + limit).map((s) => s.entry),
  };
}
