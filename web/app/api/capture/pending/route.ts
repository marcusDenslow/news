import { NextRequest, NextResponse } from "next/server";
import { entriesForDomains } from "@/lib/premiumEntries";
import { hasCapture } from "@/lib/captureStore";

// hasCapture touches the filesystem store — Node runtime.
export const runtime = "nodejs";

const TOKEN = process.env.CAPTURE_TOKEN ?? "";
const DEFAULT_USER = "default";

// Tells the extension which articles from the given (premium) domains are still
// missing full text, so it can backfill them from the user's session. Gathered
// per-feed, so a high-volume feed can't bury a paywalled one.
export async function GET(req: NextRequest) {
  if (!TOKEN) {
    return NextResponse.json({ error: "capture disabled" }, { status: 503 });
  }
  const presented = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (presented !== TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const domains = new Set(
    (req.nextUrl.searchParams.get("domains") ?? "")
      .split(",")
      .map((d) => d.trim().toLowerCase().replace(/^www\./, ""))
      .filter(Boolean),
  );
  if (!domains.size) return NextResponse.json({ pending: [] });

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 20, 50);
  const candidates = await entriesForDomains(domains);

  const pending: { url: string; title: string }[] = [];
  for (const c of candidates) {
    if (pending.length >= limit) break;
    if (!(await hasCapture(DEFAULT_USER, c.url))) pending.push(c);
  }

  return NextResponse.json({ pending });
}
