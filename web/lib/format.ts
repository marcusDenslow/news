// Client-safe presentation helpers (no secrets, no server imports).

export const imgProxy = (url: string) => `/api/img?url=${encodeURIComponent(url)}`;
export const faviconUrl = (feedId: number) => `/api/icon/${feedId}`;

export async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/** Compact, Apple-News-style timestamp: "now", "8m", "3h", "2d", else "Jun 12". */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 45) return "now";
  if (secs < 90) return "1m";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  const d = new Date(then);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Full, human date for the reader byline. */
export function fullDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Curated editorial palette — readable on both white and near-black cards.
const FEED_COLORS = [
  "#e0245e", "#1d9bf0", "#ff7a00", "#7c3aed", "#e11d48",
  "#0ea5e9", "#16a34a", "#d97706", "#db2777", "#2563eb",
  "#dc2626", "#0891b2", "#9333ea", "#ca8a04", "#ea580c",
];

export function feedColor(feedId: number): string {
  return FEED_COLORS[Math.abs(feedId) % FEED_COLORS.length];
}

export function readingTimeLabel(minutes: number): string {
  if (!minutes || minutes < 1) return "1 min read";
  return `${minutes} min read`;
}
