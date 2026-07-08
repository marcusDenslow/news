// Dependency-free fuzzy text matching for the article search index.
//
// Goal: make search feel like fzf / ripgrep — a query term need not be a whole,
// correctly spelled word. Each query token is matched against a document's
// weighted fields in three tiers, best score wins:
//
//   1. substring     "gubernat"  → "gubernatorial"    (ripgrep-like, partial word)
//   2. edit distance "guvernor"  → "governor"          (typo tolerance)
//   3. subsequence   "gbrtl"     → "gubernatorial"     (fzf-like, gaps allowed)
//
// AND semantics across tokens: every token must match somewhere, so adding words
// narrows results. Final score is the sum of per-token best scores; docs where
// any token fails to match score 0 and are dropped.

function isAlnum(code: number): boolean {
	return (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
}

// NFKD decomposes accented chars into base + combining mark so the mark can be
// stripped ("café" → "cafe").
export function normalize(s: string): string {
	return (s ?? "")
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "");
}

export function words(normalized: string): string[] {
	return normalized.split(/[^a-z0-9]+/).filter(Boolean);
}

export function tokenize(q: string): string[] {
	return words(normalize(q));
}

// How many single-character edits a typo'd token may differ by. Short tokens get
// no slack (too noisy — they lean on the substring tier instead).
function maxEdits(len: number): number {
	if (len < 4) return 0;
	if (len < 7) return 1;
	return 2;
}

// Bounded Levenshtein. Returns the true distance if it is <= max, otherwise
// max + 1. Early-exits a row once its minimum exceeds max.
export function editDistance(a: string, b: string, max: number): number {
	const al = a.length;
	const bl = b.length;
	if (a == b) return 0;
	if (Math.abs(al - bl) > max) return max + 1;

	let prev = new Array<number>(bl + 1);
	let curr = new Array<number>(bl + 1);
	for (let j = 0; j <= bl; j++) prev[j] = j;

	for (let i = 1; i <= al; i++) {
		curr[0] = i;
		let rowMin = i;
		const ai = a.charCodeAt(i - 1)
		for (let j = 1; j <= bl; j++) {
			const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
			const v = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
			curr[j] = v;
			if (v < rowMin) rowMin = v
		}
		if (rowMin > max) return max + 1;
		const tmp = prev;
		prev = curr;
		curr = tmp;
	}
	return prev[bl];
}

// fzf-style subsequence: token chars must appear in order within text. Rewards
// contiguous runs and word-boundary starts so "read" prefers "reader" over a
// scatter of r…e…a…d. Normalized to ~0..1; returns 0 if not a subsequence.
function subsequenceScore(token: string, text: string): number {
	let ti = 0;
	let raw = 0;
	let prevIdx = -2;
	for (let i = 0; i < text.length && ti < token.length; i++) {
		if (text.charCodeAt(i) === token.charCodeAt(ti)) {
			const boundary = i === 0 || !isAlnum(text.charCodeAt(i - 1));
			const contiguous = i === prevIdx + 1;
			raw += 1 + (contiguous ? 0.6 : 0) + (boundary ? 0.4 : 0);
			prevIdx = i;
			ti++;
		}
	}
	if (ti < token.length) return 0;
	return raw / (token.length * 2);
}

interface FieldOpts {
	fuzzy: boolean; // allow edit-distance (typo) matching
	subseq: boolean; // allow subsequence (fzf) matching
}

// Best score (0..1) for one token against one field.
function tokenFieldScore(
	token: string,
	field: string,
	fieldWords: string[],
	opts: FieldOpts,
): number {
	if (!field) return 0;

	// Tier 1 — substring (exact + partial words).
	const idx = field.indexOf(token);
	if (idx >= 0) {
		const atStart = idx === 0 || !isAlnum(field.charCodeAt(idx - 1));
		const end = idx + token.length;
		const atEnd = end === field.length || !isAlnum(field.charCodeAt(end));
		return atStart && atEnd ? 1.0 : atStart ? 0.9 : 0.7;
	}

	// Tier 2 — edit distance against each field word (typo tolerance).
	if (opts.fuzzy) {
		const max = maxEdits(token.length);
		if (max > 0) {
			let best = 0;
			for (const w of fieldWords) {
				let d = editDistance(token, w, max);
				// Typo inside a partial word: compare against the word's leading
				// slice so "guvernat" still reaches "gubernatorial".
				if (d > max && w.length > token.length) {
					d = editDistance(token, w.slice(0, token.length + max), max);
				}
				if (d <= max) {
					const s = 0.85 * (1 - d / (token.length + 1));
					if (s > best) best = s;
					if (best >= 0.8) break;
				}
			}
			if (best > 0) return best;
		}
	}

	// Tier 3 — subsequence (fzf). Longer tokens only, to keep noise down.
	if (opts.subseq && token.length >= 3) {
		const s = subsequenceScore(token, field);
		if (s > 0) return Math.min(0.45, s);
	}

	return 0;
}

export interface DocFields {
	title: string;
	titleWords: string[];
	meta: string; // author + feed + domain, normalized
	metaWords: string[];
	body: string; // full article text, normalized (may be large)
	bodyWords: string[]; // unique body words, for typo (edit-distance) matching
}

const W_TITLE = 3;
const W_META = 1.2;
const W_BODY = 1;

// Body allows substring + edit distance (typos), but not subsequence — a gap
// match across a whole article is almost always noise. Edit distance runs over
// the deduped body vocabulary (see searchIndex) to keep it affordable.
const BODY_OPTS: FieldOpts = { fuzzy: true, subseq: false };
const TEXT_OPTS: FieldOpts = { fuzzy: true, subseq: true };

// Score a document against the query tokens. Returns 0 when any token fails to
// match any field (AND semantics), otherwise the summed per-token best score.
export function scoreDoc(tokens: string[], d: DocFields): number {
	let total = 0;
	for (const t of tokens) {
		const best = Math.max(
			W_TITLE * tokenFieldScore(t, d.title, d.titleWords, TEXT_OPTS),
			W_META * tokenFieldScore(t, d.meta, d.metaWords, TEXT_OPTS),
			W_BODY * tokenFieldScore(t, d.body, d.bodyWords, BODY_OPTS),
		);
		if (best <= 0) return 0;
		total += best;
	}
	return total;
}
