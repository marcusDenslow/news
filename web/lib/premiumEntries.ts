// Candidate articles for the premium domains, gathered PER FEED rather than from
// a global "recent entries" window. A high-volume feed (e.g. The Guardian) would
// otherwise bury a low-volume paywalled feed's articles past any scan limit.

import { listFeeds, listEntries } from "./miniflux";

function hostOf(u: string): string {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export async function entriesForDomains(
  domains: Set<string>,
  perFeedLimit = 100,
): Promise<{ url: string; title: string }[]> {
  if (!domains.size) return [];
  const feeds = await listFeeds();
  const matched = feeds.filter((f) => domains.has(hostOf(f.siteUrl)) || domains.has(hostOf(f.feedUrl)));

  const out: { url: string; title: string }[] = [];
  for (const f of matched) {
    const { entries } = await listEntries({ feedId: f.id, limit: perFeedLimit });
    for (const e of entries) out.push({ url: e.url, title: e.title });
  }
  return out;
}
