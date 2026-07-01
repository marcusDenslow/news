import { NextRequest, NextResponse } from "next/server";
import { listEntries } from "@/lib/miniflux";
import { hasCapture } from "@/lib/captureStore";

// hasCapture touches the filesystem store — Node runtime.
export const runtime = "nodejs";

const TOKEN = process.env.CAPTURE_TOKEN ?? "";
const DEFAULT_USER = "default";

function hostOf(u: string): string {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Tells the extension which recent articles from the given (premium) domains are
// still missing full text, so it can backfill them from the user's session.
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
  const scan = Math.min(Number(req.nextUrl.searchParams.get("scan")) || 150, 300);

  const { entries } = await listEntries({ limit: scan });
  const pending: { url: string; title: string }[] = [];
  for (const e of entries) {
    if (pending.length >= limit) break;
    if (!domains.has(hostOf(e.url))) continue;
    if (!(await hasCapture(DEFAULT_USER, e.url))) pending.push({ url: e.url, title: e.title });
  }

  return NextResponse.json({ pending });
}
