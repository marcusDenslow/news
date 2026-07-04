import { NextResponse } from "next/server";
import { toggleStar } from "@/lib/miniflux";
import { withSession } from "@/lib/apiAuth";

export async function PUT(_req: Request, ctx: RouteContext<"/api/entries/[id]/star">) {
  return withSession(async () => {
    const { id } = await ctx.params;
    try {
      await toggleStar(Number(id));
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 502 });
    }
  });
}
