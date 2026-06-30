import { NextRequest, NextResponse } from "next/server";
import { listEntries } from "@/lib/miniflux";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const num = (k: string) => {
    const v = sp.get(k);
    return v != null && v !== "" ? Number(v) : undefined;
  };

  try {
    const data = await listEntries({
      status: sp.get("status") ?? undefined,
      starred: sp.get("starred") === "true",
      categoryId: num("category"),
      feedId: num("feed"),
      search: sp.get("search") ?? undefined,
      today: sp.get("today") === "true",
      limit: num("limit"),
      offset: num("offset"),
    });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
