import { NextResponse } from "next/server";
import { deleteFeed } from "@/lib/miniflux";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/feeds/[id]">) {
  const { id } = await ctx.params;
  try {
    await deleteFeed(Number(id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
