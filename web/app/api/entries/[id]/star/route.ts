import { NextResponse } from "next/server";
import { toggleStar } from "@/lib/miniflux";

export async function PUT(_req: Request, ctx: RouteContext<"/api/entries/[id]/star">) {
  const { id } = await ctx.params;
  try {
    await toggleStar(Number(id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
