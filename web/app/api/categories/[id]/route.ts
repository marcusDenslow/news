import { NextResponse } from "next/server";
import { deleteCategory } from "@/lib/miniflux";
import { withSession } from "@/lib/apiAuth";

// Delete a folder (category). The caller is expected to have emptied it first
// (moved or deleted its feeds) — Miniflux won't drop a non-empty category.
export async function DELETE(_req: Request, ctx: RouteContext<"/api/categories/[id]">) {
  return withSession(async () => {
    const { id } = await ctx.params;
    const catId = Number(id);
    if (!Number.isFinite(catId)) {
      return NextResponse.json({ error: "bad id" }, { status: 400 });
    }
    try {
      await deleteCategory(catId);
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 502 });
    }
  });
}
