import { NextResponse } from "next/server";
import { refreshAll } from "@/lib/miniflux";
import { withSession } from "@/lib/apiAuth";

export async function POST() {
  return withSession(async () => {
    try {
      await refreshAll();
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 502 });
    }
  });
}
