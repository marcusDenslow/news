// Encrypted, per-domain cookie storage for the SERVER-SIDE fetch service.
//
// This is the one place the app holds a publisher secret. It exists only for the
// headless mode (no browser needed) and is OFF unless NEWSHUB_SECRET_KEY is set —
// so the open-source default never stores credentials. On a single-user/family
// box you set the key and accept the tradeoff for hands-off fetching.
//
// AES-256-GCM (authenticated) at rest, key derived from NEWSHUB_SECRET_KEY.

import { createCipheriv, createDecipheriv, randomBytes, createHash, scryptSync } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const SECRET = process.env.NEWSHUB_SECRET_KEY ?? "";
const DATA_DIR = process.env.NEWSHUB_DATA_DIR ?? path.join(process.cwd(), "data");
const COOKIES_DIR = path.join(DATA_DIR, "cookies");

/** Server-side fetching is only enabled when an encryption key is configured. */
export function serverCaptureEnabled(): boolean {
  return SECRET.length >= 16;
}

let derived: Buffer | null = null;
function key(): Buffer {
  if (!derived) derived = scryptSync(SECRET, "newshub-cookie-v1", 32);
  return derived;
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

function decrypt(b64: string): string {
  const raw = Buffer.from(b64, "base64");
  const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
}

const hash = (s: string, n: number) => createHash("sha256").update(s).digest("hex").slice(0, n);
const norm = (domain: string) => domain.trim().toLowerCase().replace(/^www\./, "");
const filePath = (userKey: string, domain: string) =>
  path.join(COOKIES_DIR, hash(userKey, 16), `${hash(norm(domain), 24)}.json`);

interface CookieRecord {
  domain: string;
  cookie: string; // encrypted
  updatedAt: string;
}

export async function setCookie(userKey: string, domain: string, cookie: string): Promise<void> {
  const p = filePath(userKey, domain);
  await fs.mkdir(path.dirname(p), { recursive: true });
  const rec: CookieRecord = { domain: norm(domain), cookie: encrypt(cookie), updatedAt: new Date().toISOString() };
  await fs.writeFile(p, JSON.stringify(rec), "utf8");
}

export async function getCookie(userKey: string, domain: string): Promise<string | null> {
  try {
    const rec = JSON.parse(await fs.readFile(filePath(userKey, domain), "utf8")) as CookieRecord;
    return decrypt(rec.cookie);
  } catch {
    return null;
  }
}

export async function deleteCookie(userKey: string, domain: string): Promise<void> {
  await fs.rm(filePath(userKey, domain), { force: true });
}

/** Domains that have a stored cookie = the premium/auto-fetch set for this user. */
export async function listCookieDomains(userKey: string): Promise<string[]> {
  const dir = path.join(COOKIES_DIR, hash(userKey, 16));
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const domains: string[] = [];
  for (const f of files) {
    try {
      const rec = JSON.parse(await fs.readFile(path.join(dir, f), "utf8")) as CookieRecord;
      if (rec.domain) domains.push(rec.domain);
    } catch {
      /* skip unreadable */
    }
  }
  return domains;
}
