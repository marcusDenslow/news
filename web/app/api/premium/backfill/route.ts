import { NextRequest, NextResponse } from "next/server";
import { serverCaptureEnabled } from "@/lib/cookieStore";
import { backfillTick } from "@/lib/serverBackfill";

export const runtime = "nodejs";

const TOKEN = process.env.CAPTURE_TOKEN ?? "";

// Manually run a server-side backfill pass now, instead of waiting for the timer.
// Handy for testing and for catching up a backlog (?max=, default 12).
export async function POST(req: NextRequest) {
  if (!serverCaptureEnabled()) {
    return NextResponse.json({ error: "server-side fetch disabled" }, { status: 503 });
  }
  const presented = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!TOKEN || presented !== TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const max = Math.min(Number(req.nextUrl.searchParams.get("max")) || 12, 40);
  const result = await backfillTick(max);
  return NextResponse.json({ ok: true, ...result });
}
