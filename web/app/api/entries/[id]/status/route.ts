import { NextRequest, NextResponse } from "next/server";
import { setStatus } from "@/lib/miniflux";
import { withSession } from "@/lib/apiAuth";

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/entries/[id]/status">) {
  return withSession(async () => {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { status?: "read" | "unread" };
    const status = body.status === "unread" ? "unread" : "read";
    try {
      await setStatus([Number(id)], status);
      return NextResponse.json({ ok: true, status });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 502 });
    }
  });
}
