import { NextRequest, NextResponse } from "next/server";
import { sanitizeArticleHtml } from "@/lib/sanitizeHtml";
import { putCapture } from "@/lib/captureStore";
import { htmlToText } from "@/lib/miniflux";

// jsdom (sanitizer) needs the Node runtime, not edge.
export const runtime = "nodejs";

const TOKEN = process.env.CAPTURE_TOKEN ?? "";
// Phase 1 is single-tenant: one shared token -> one logical user. When multi-user
// auth lands, map the bearer token to a real user key here.
const DEFAULT_USER = "default";
const MAX_HTML = 3_000_000; // 3 MB of raw article HTML is already generous
const MIN_TEXT = 200; // shorter than this and it's a teaser/stub, not an article

interface CaptureBody {
  url?: string;
  urls?: string[];
  title?: string;
  html?: string;
  byline?: string;
  siteName?: string;
}

export async function POST(req: NextRequest) {
  if (!TOKEN) {
    return NextResponse.json(
      { error: "capture disabled: set CAPTURE_TOKEN on the server" },
      { status: 503 },
    );
  }
  const presented = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (presented !== TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as CaptureBody;
  const candidates = [body.url, ...(body.urls ?? [])].filter(
    (u): u is string => typeof u === "string" && u.length > 0,
  );
  const html = typeof body.html === "string" ? body.html : "";

  if (!candidates.length || !html) {
    return NextResponse.json({ error: "url and html are required" }, { status: 400 });
  }
  if (html.length > MAX_HTML) {
    return NextResponse.json({ error: "html too large" }, { status: 413 });
  }

  const clean = sanitizeArticleHtml(html);
  const textLength = htmlToText(clean).length;
  if (textLength < MIN_TEXT) {
    return NextResponse.json(
      { error: "extracted content too short — not an article page?" },
      { status: 422 },
    );
  }

  const { keys } = await putCapture(DEFAULT_USER, candidates, {
    title: (body.title ?? "").slice(0, 500),
    byline: (body.byline ?? "").slice(0, 300),
    siteName: (body.siteName ?? "").slice(0, 200),
    html: clean,
    textLength,
    capturedAt: new Date().toISOString(),
  });

  if (!keys.length) {
    return NextResponse.json({ error: "no valid url to key on" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, stored: keys.length, textLength });
}
