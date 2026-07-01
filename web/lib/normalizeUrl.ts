// Canonicalize article URLs so a link from an RSS feed and the same article
// opened in the user's browser resolve to the *same* storage key. Without this,
// a captured article would rarely match its Miniflux entry (tracking params,
// www., http vs https, trailing slashes all differ).

const TRACKING_PARAMS: RegExp[] = [
  /^utm_/i, /^fbclid$/i, /^gclid$/i, /^dclid$/i, /^gbraid$/i, /^wbraid$/i,
  /^msclkid$/i, /^yclid$/i, /^mc_/i, /^ref$/i, /^ref_src$/i, /^ref_url$/i,
  /^referrer$/i, /^cmpid$/i, /^cid$/i, /^igshid$/i, /^spm$/i, /^s_kwcid$/i,
  /^ecid$/i, /^oly_/i, /^_hs[a-z]*$/i, /^vero_/i, /^__twitter_impression$/i,
  /^guccounter$/i, /^guce_/i,
];

function isTracking(key: string): boolean {
  return TRACKING_PARAMS.some((re) => re.test(key));
}

/**
 * Stable identity key for one article. Lowercases the host, strips `www.` and
 * tracking params, drops the fragment, folds http→https, sorts the surviving
 * query params, and trims a trailing slash. Returns null for non-http(s) input.
 */
export function normalizeUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;

  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  let path = u.pathname || "/";
  if (path.length > 1) path = path.replace(/\/+$/, ""); // keep root "/", trim the rest

  const kept = [...u.searchParams.entries()]
    .filter(([k]) => !isTracking(k))
    .sort(([a], [b]) => a.localeCompare(b));
  const qs = new URLSearchParams(kept).toString();

  return `https://${host}${path}${qs ? `?${qs}` : ""}`;
}

/** Normalize a list of candidate URLs for one article, de-duped, nulls dropped. */
export function candidateKeys(urls: string[]): string[] {
  const out = new Set<string>();
  for (const raw of urls) {
    const n = normalizeUrl(raw);
    if (n) out.add(n);
  }
  return [...out];
}
