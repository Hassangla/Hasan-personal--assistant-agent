import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/auth/session";

// Paths that handle their own auth (own secrets) or must stay public.
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth",
  "/api/telegram", // verifies Telegram secret + user id
  "/api/email", // verifies its own push token (Part 4)
  "/api/agent/tick", // verifies CRON_SECRET
  "/api/calendar", // .ics subscription feed — the URL token is the credential
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // API routes also accept an x-api-secret header for programmatic calls.
  if (pathname.startsWith("/api/")) {
    const provided = req.headers.get("x-api-secret");
    const expected = process.env.API_SECRET;
    if (expected && provided && provided === expected) {
      return NextResponse.next();
    }
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const ok = await verifySession(process.env.AUTH_SECRET ?? "", token);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
