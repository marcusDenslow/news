import { NextRequest, NextResponse } from "next/server";
import { markAllRead } from "@/lib/miniflux";
import { withSession } from "@/lib/apiAuth";

export async function POST(req: NextRequest) {
  return withSession(async () => {
    const body = (await req.json().catch(() => ({}))) as {
      feedId?: number;
      categoryId?: number;
    };
    try {
      await markAllRead({ feedId: body.feedId, categoryId: body.categoryId });
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 502 });
    }
  });
}
