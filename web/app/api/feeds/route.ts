import { NextRequest, NextResponse } from "next/server";
import { getFeedsTree, createFeed } from "@/lib/miniflux";

export async function GET() {
  try {
    return NextResponse.json(await getFeedsTree());
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { feedUrl?: string; categoryId?: number };
  const feedUrl = (body.feedUrl ?? "").trim();
  if (!feedUrl) {
    return NextResponse.json({ error: "feedUrl required" }, { status: 400 });
  }
  try {
    const result = await createFeed(feedUrl, body.categoryId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
