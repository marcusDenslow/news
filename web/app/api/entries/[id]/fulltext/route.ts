import { NextResponse } from "next/server";
import { fetchFullContent, getEntry } from "@/lib/miniflux";
import { getCapture } from "@/lib/captureStore";
import { withSession } from "@/lib/apiAuth";

// getCapture touches the filesystem store — Node runtime.
export const runtime = "nodejs";

const DEFAULT_USER = "default";

export async function GET(_req: Request, ctx: RouteContext<"/api/entries/[id]/fulltext">) {
  return withSession(async () => {
    const { id } = await ctx.params;
    try {
      // Prefer a host-captured copy. This is what unlocks paywalled/subscriber
      // articles: the capture store is host-wide (keyed "default"), so the
      // full text fetched with the shared premium cookie is available to any
      // signed-in reader. Fall back to Miniflux's scraper for open articles.
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
  });
}
