import { NextResponse } from "next/server";
import { getEntry } from "@/lib/miniflux";
import { withSession } from "@/lib/apiAuth";

export async function GET(_req: Request, ctx: RouteContext<"/api/entries/[id]">) {
  return withSession(async () => {
    const { id } = await ctx.params;
    try {
      return NextResponse.json(await getEntry(Number(id)));
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 502 });
    }
  });
}
