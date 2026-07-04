// AES-256-GCM helpers for session storage at rest. Prefers NEWSHUB_SECRET_KEY
// (same key the cookie store uses); falls back to MINIFLUX_TOKEN so login works
// on a fresh box without extra config. A key change (or restart without a stable
// key) just invalidates existing sessions — users re-log in.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const SECRET = process.env.NEWSHUB_SECRET_KEY || process.env.MINIFLUX_TOKEN || "";

let derived: Buffer | null = null;
function key(): Buffer {
  if (!derived) derived = scryptSync(SECRET, "newshub-session-v1", 32);
  return derived;
}

export function sessionSecretReady(): boolean {
  return SECRET.length >= 16;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

export function decrypt(b64: string): string {
  const raw = Buffer.from(b64, "base64");
  const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
}

export function randomId(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}
