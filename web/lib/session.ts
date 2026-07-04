// File-backed sessions. The cookie holds only an opaque id; the encrypted
// Miniflux credential (an `Authorization: Basic …` header) lives server-side, so
// a leaked cookie can't be replayed off-box and the credential never reaches the
// browser. Miniflux does the real auth + per-user data separation.

import { promises as fs } from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { encrypt, decrypt, randomId } from "./crypto";

const DATA_DIR = process.env.NEWSHUB_DATA_DIR ?? path.join(process.cwd(), "data");
const SESSIONS_DIR = path.join(DATA_DIR, "sessions");
export const SESSION_COOKIE = "reader_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export interface Session {
  id: string;
  username: string;
  authHeaders: Record<string, string>;
}

interface Stored {
  username: string;
  auth: string; // encrypted "Basic …" header value
  createdAt: string;
}

const idRe = /^[a-f0-9]{64}$/; // guards the filename against path traversal
const file = (id: string) => path.join(SESSIONS_DIR, `${id}.json`);

export async function createSession(username: string, authHeaderValue: string): Promise<string> {
  const id = randomId(32);
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
  const rec: Stored = { username, auth: encrypt(authHeaderValue), createdAt: new Date().toISOString() };
  await fs.writeFile(file(id), JSON.stringify(rec), "utf8");
  const c = await cookies();
  c.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
    // Opt-in: a self-host served over plain http (e.g. across a tailnet) must NOT
    // mark the cookie Secure or the browser won't send it. Set COOKIE_SECURE=1
    // when serving over https.
    secure: process.env.COOKIE_SECURE === "1",
  });
  return id;
}

export async function getSession(): Promise<Session | null> {
  const c = await cookies();
  const id = c.get(SESSION_COOKIE)?.value;
  if (!id || !idRe.test(id)) return null;
  try {
    const rec = JSON.parse(await fs.readFile(file(id), "utf8")) as Stored;
    return { id, username: rec.username, authHeaders: { Authorization: decrypt(rec.auth) } };
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const c = await cookies();
  const id = c.get(SESSION_COOKIE)?.value;
  if (id && idRe.test(id)) await fs.rm(file(id), { force: true }).catch(() => {});
  c.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}
