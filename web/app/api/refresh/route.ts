import { NextResponse } from "next/server";
import { refreshAll } from "@/lib/miniflux";

export async function POST() {
  try {
    await refreshAll();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
