import { NextResponse } from "next/server";
import { verifyCredentials } from "@/lib/miniflux";
import { createSession } from "@/lib/session";
import { sessionSecretReady } from "@/lib/crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!sessionSecretReady()) {
    return NextResponse.json(
      { error: "server not configured for login (set NEWSHUB_SECRET_KEY or MINIFLUX_TOKEN)" },
      { status: 503 }
    );
  }
  const body = (await req.json().catch(() => ({}))) as { username?: string; password?: string };
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  if (!username || !password) {
    return NextResponse.json({ error: "username and password required" }, { status: 400 });
  }
  const ok = await verifyCredentials(username, password);
  if (!ok) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }
  await createSession(ok.username, ok.authHeader);
  return NextResponse.json({ username: ok.username });
}
