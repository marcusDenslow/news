import { NextResponse } from "next/server";
import { listUsers, createUser } from "@/lib/miniflux";

export const runtime = "nodejs";

// The profile rail — just usernames, no secrets.
export async function GET() {
  try {
    const users = await listUsers();
    return NextResponse.json({ users: users.map((u) => u.username) });
  } catch (err) {
    // Admin token missing/insufficient — surface an empty rail rather than 500.
    return NextResponse.json({ users: [], error: String(err) }, { status: 200 });
  }
}

// Create a new profile (Miniflux user). Open on the login screen by design —
// it's a family box behind the tailnet — so no session is required here.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { username?: string; password?: string };
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  if (!username || !password) {
    return NextResponse.json({ error: "username and password required" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "password must be at least 6 characters" }, { status: 400 });
  }
  try {
    const user = await createUser(username, password);
    return NextResponse.json({ username: user.username });
  } catch (err) {
    const msg = /already exists/i.test(String(err))
      ? "That name is taken."
      : "Couldn’t create the profile.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
