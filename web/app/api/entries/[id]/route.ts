import { NextResponse } from "next/server";
import { getEntry } from "@/lib/miniflux";

export async function GET(_req: Request, ctx: RouteContext<"/api/entries/[id]">) {
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await getEntry(Number(id)));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
