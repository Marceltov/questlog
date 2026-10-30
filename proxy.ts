import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Every page needs a session. Exempt: the sign-in (/login) and consent pages, /health, and /mcp, /api/* and /.well-known/*, which check
// credentials themselves: redirecting them to /login would turn a client's 401 into a success-looking 307. Only the cookie's presence is
// checked here (the proxy doesn't ask the database); pages get the player from playerFromHeaders, which checks the session.
const EXEMPT = /^\/(login|consent|health|mcp|favicon\.ico|icon\.svg)$|^\/(api|\.well-known|_next)\//;

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (EXEMPT.test(pathname) || getSessionCookie(req)) return NextResponse.next();
  // Absolute (Next rejects a relative Location here), and from PUBLIC_URL when set, so it is right behind a reverse proxy.
  const login = new URL("/login", process.env.PUBLIC_URL || req.nextUrl.origin);
  if (pathname !== "/") login.searchParams.set("next", pathname + search); // checked by safeNext after sign-in
  return NextResponse.redirect(login);
}

export const config = {
  matcher: "/((?!_next/|favicon\\.ico).*)",
};
