import { NextResponse } from "next/server";
import { fetchFullContent, getEntry } from "@/lib/miniflux";
import { getCapture } from "@/lib/captureStore";

// getCapture touches the filesystem store — Node runtime.
export const runtime = "nodejs";

const DEFAULT_USER = "default";

export async function GET(_req: Request, ctx: RouteContext<"/api/entries/[id]/fulltext">) {
  const { id } = await ctx.params;
  try {
    // Prefer a browser-captured copy. This is what unlocks paywalled/subscriber
    // articles: the server itself only ever sees the guest stub, but the user's
    // extension captured the full text from their logged-in session. Fall back to
    // Miniflux's own scraper when no capture exists (free/open articles).
    const entry = await getEntry(Number(id));
    const cap = await getCapture(DEFAULT_USER, entry.url);
    if (cap) {
      return NextResponse.json({ content: cap.html, source: "capture" });
    }
    const content = await fetchFullContent(Number(id));
    return NextResponse.json({ content, source: "scraper" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
