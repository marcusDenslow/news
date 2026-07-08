import { NextRequest, NextResponse } from "next/server";
import { listEntries } from "@/lib/miniflux";
import { searchEntries } from "@/lib/searchIndex";
import { withSession } from "@/lib/apiAuth";

// searchEntries reads the capture store from disk — needs the Node runtime.
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return withSession(async (session) => {
    const sp = req.nextUrl.searchParams;
    const num = (k: string) => {
      const v = sp.get(k);
      return v != null && v !== "" ? Number(v) : undefined;
    };

    const params = {
      status: sp.get("status") ?? undefined,
      starred: sp.get("starred") === "true",
      categoryId: num("category"),
      feedId: num("feed"),
      today: sp.get("today") === "true",
      limit: num("limit"),
      offset: num("offset"),
    };
    const search = (sp.get("search") ?? "").trim();

    try {
      // Local fuzzy search (partial words + typos, over captured full text) when
      // there's a query; plain Miniflux listing otherwise.
      const data = search
        ? await searchEntries(session.username, params, search, params.limit ?? 24, params.offset ?? 0)
        : await listEntries(params);
      return NextResponse.json(data);
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 502 });
    }
  });
}
