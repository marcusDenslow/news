import { NextResponse } from "next/server";
import { deleteFeed, moveFeed } from "@/lib/miniflux";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/feeds/[id]">) {
  const { id } = await ctx.params;
  try {
    await deleteFeed(Number(id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}

// Move a feed to a different folder (category). Body: { categoryId: number }.
export async function PATCH(req: Request, ctx: RouteContext<"/api/feeds/[id]">) {
  const { id } = await ctx.params;
  try {
    const { categoryId } = (await req.json()) as { categoryId?: number };
    if (!categoryId) {
      return NextResponse.json({ error: "categoryId required" }, { status: 400 });
    }
    await moveFeed(Number(id), Number(categoryId));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
