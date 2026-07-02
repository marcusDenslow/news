import { NextResponse } from "next/server";
import { createCategory } from "@/lib/miniflux";

// Create a folder (category). Body: { title: string }.
export async function POST(req: Request) {
  try {
    const { title } = (await req.json()) as { title?: string };
    if (!title?.trim()) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }
    const cat = await createCategory(title.trim());
    return NextResponse.json(cat);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
