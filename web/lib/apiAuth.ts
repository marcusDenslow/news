// Guard for the Miniflux-backed API routes: resolve the caller's session, reject
// if absent, and run the handler with that user's credential in scope so every
// `mf()` call underneath hits Miniflux as the logged-in user.

import { NextResponse } from "next/server";
import { authStore } from "./authContext";
import { getSession, type Session } from "./session";

export async function withSession(
  fn: (session: Session) => Promise<Response> | Response
): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return authStore.run({ authHeaders: session.authHeaders }, () => fn(session));
}
