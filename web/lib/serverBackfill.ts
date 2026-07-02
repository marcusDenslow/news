// The server-side backfill tick: for every domain the user stored a cookie for,
// find articles lacking full text and fetch them headlessly. Runs on a timer from
// instrumentation.ts — no browser, no GUI.

import { hasCapture, putCapture } from "./captureStore";
import { listCookieDomains, getCookie } from "./cookieStore";
import { fetchArticle } from "./fetchArticle";
import { entriesForDomains } from "./premiumEntries";

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

  const candidates = await entriesForDomains(new Set(domains));
  let fetched = 0;
  let failed = 0;

  for (const c of candidates) {
    if (fetched >= max) break;
    if (await hasCapture(USER, c.url)) continue;

    const cookie = await getCookie(USER, hostOf(c.url));
    if (!cookie) continue;

    const art = await fetchArticle(c.url, cookie);
    if (!art) {
      failed++;
      continue;
    }
    await putCapture(USER, [c.url], {
      title: art.title || c.title,
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
