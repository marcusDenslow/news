// The server-side backfill tick: for every domain the user stored a cookie for,
// find recent entries lacking full text and fetch them headlessly. Runs on a
// timer from instrumentation.ts — no browser, no GUI.

import { listEntries } from "./miniflux";
import { hasCapture, putCapture } from "./captureStore";
import { listCookieDomains, getCookie } from "./cookieStore";
import { fetchArticle } from "./fetchArticle";

const USER = "default";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function hostOf(u: string): string {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export async function backfillTick(max = 6): Promise<{ fetched: number; failed: number }> {
  const domains = await listCookieDomains(USER);
  if (!domains.length) return { fetched: 0, failed: 0 };
  const domainSet = new Set(domains);

  const { entries } = await listEntries({ limit: 150 });
  let fetched = 0;
  let failed = 0;

  for (const e of entries) {
    if (fetched >= max) break;
    const host = hostOf(e.url);
    if (!domainSet.has(host)) continue;
    if (await hasCapture(USER, e.url)) continue;

    const cookie = await getCookie(USER, host);
    if (!cookie) continue;

    const art = await fetchArticle(e.url, cookie);
    if (!art) {
      failed++;
      continue;
    }
    await putCapture(USER, [e.url], {
      title: art.title || e.title,
      byline: art.byline,
      siteName: art.siteName,
      html: art.html,
      textLength: art.textLength,
      capturedAt: new Date().toISOString(),
    });
    fetched++;
    await sleep(3000 + Math.random() * 3000); // polite jitter between fetches
  }

  return { fetched, failed };
}
