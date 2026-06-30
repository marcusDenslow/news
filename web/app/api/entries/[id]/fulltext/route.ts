import { NextResponse } from "next/server";
import { fetchFullContent } from "@/lib/miniflux";

export async function GET(_req: Request, ctx: RouteContext<"/api/entries/[id]/fulltext">) {
  const { id } = await ctx.params;
  try {
    const content = await fetchFullContent(Number(id));
    return NextResponse.json({ content });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
