import { NextRequest, NextResponse } from "next/server";
import { setCookie, deleteCookie, listCookieDomains, serverCaptureEnabled } from "@/lib/cookieStore";

export const runtime = "nodejs";

const TOKEN = process.env.CAPTURE_TOKEN ?? "";
const DEFAULT_USER = "default";

function authed(req: NextRequest): boolean {
  const presented = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  return TOKEN.length > 0 && presented === TOKEN;
}

// List domains that have a stored cookie (no secrets returned).
export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ enabled: serverCaptureEnabled(), domains: await listCookieDomains(DEFAULT_USER) });
}

// Store (or update) the cookie for a domain.
export async function POST(req: NextRequest) {
  if (!serverCaptureEnabled()) {
    return NextResponse.json(
      { error: "server-side fetch disabled: set NEWSHUB_SECRET_KEY on the server" },
      { status: 503 },
    );
  }
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Two body shapes: JSON {domain, cookie} (the extension), or a raw cookie body
  // with ?domain= in the query (curl / the CLI — no JSON escaping needed).
  let domain = "";
  let cookie = "";
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as { domain?: string; cookie?: string };
    domain = (body.domain ?? "").trim();
    cookie = (body.cookie ?? "").trim();
  } else {
    domain = (req.nextUrl.searchParams.get("domain") ?? "").trim();
    cookie = (await req.text()).trim();
  }
  if (!domain || !cookie) {
    return NextResponse.json({ error: "domain and cookie required" }, { status: 400 });
  }
  await setCookie(DEFAULT_USER, domain, cookie);
  return NextResponse.json({ ok: true, domain });
}

// Remove a domain's cookie (stops server-side fetching for it).
export async function DELETE(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const domain = (req.nextUrl.searchParams.get("domain") ?? "").trim();
  if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });
  await deleteCookie(DEFAULT_USER, domain);
  return NextResponse.json({ ok: true });
}
