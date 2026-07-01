// Persistence for browser-captured article bodies.
//
// Architecture note: the server never sees a publisher cookie or password. The
// extension does the authenticated fetch inside the user's own logged-in browser
// and pushes only the extracted, sanitized text here. So this store holds article
// *content*, never credentials — which is what makes the whole thing safe to
// self-host and open-source.
//
// Backed by the filesystem (one JSON file per normalized URL) so a home-server
// deploy needs nothing but a mounted volume — no extra database. Swappable: the
// two exported functions are the entire contract, so a Postgres impl can drop in
// later for multi-user querying without touching call sites.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { candidateKeys, normalizeUrl } from "./normalizeUrl";

export interface CapturedArticle {
  url: string; // canonical normalized key
  title: string;
  byline: string;
  siteName: string;
  html: string; // already sanitized before it reaches here
  textLength: number;
  capturedAt: string; // ISO 8601
}

const DATA_DIR = process.env.NEWSHUB_DATA_DIR ?? path.join(process.cwd(), "data");
const CAPTURES_DIR = path.join(DATA_DIR, "captures");

function hash(input: string, len: number): string {
  return createHash("sha256").update(input).digest("hex").slice(0, len);
}

// userKey is hashed into the path so a future multi-user mapping (token -> user)
// keeps each person's captures isolated on disk.
function filePath(userKey: string, normUrl: string): string {
  return path.join(CAPTURES_DIR, hash(userKey, 16), `${hash(normUrl, 32)}.json`);
}

/**
 * Store one captured article under every candidate URL it might be looked up by
 * (canonical, og:url, the live location). Small duplication, but it means an
 * entry's feed URL will hit even when it differs from the browser URL.
 */
export async function putCapture(
  userKey: string,
  candidateUrls: string[],
  record: Omit<CapturedArticle, "url">,
): Promise<{ keys: string[] }> {
  const keys = candidateKeys(candidateUrls);
  if (!keys.length) return { keys: [] };

  const full: CapturedArticle = { ...record, url: keys[0] };
  const json = JSON.stringify(full);

  await Promise.all(
    keys.map(async (k) => {
      const p = filePath(userKey, k);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, json, "utf8");
    }),
  );
  return { keys };
}

/** Look up a captured article by any URL that identifies it. */
export async function getCapture(userKey: string, url: string): Promise<CapturedArticle | null> {
  const norm = normalizeUrl(url);
  if (!norm) return null;
  try {
    const raw = await fs.readFile(filePath(userKey, norm), "utf8");
    return JSON.parse(raw) as CapturedArticle;
  } catch {
    return null; // ENOENT (no capture) or unreadable — treat as miss
  }
}

/** Cheap existence check (stat, no read/parse) for the backfill scan. */
export async function hasCapture(userKey: string, url: string): Promise<boolean> {
  const norm = normalizeUrl(url);
  if (!norm) return false;
  try {
    await fs.stat(filePath(userKey, norm));
    return true;
  } catch {
    return false;
  }
}
