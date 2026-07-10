import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, safeCompare, verifySessionToken } from "@/lib/auth/session";

const PUBLIC_PAGE_PATHS = new Set(["/login"]);
// Routes that authenticate themselves (Telegram's own webhook secret
// header, not our cookie/API_SECRET scheme) bypass the generic gate below.
const SELF_AUTHENTICATING_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/telegram/webhook",
  "/api/cron/topic-reminders",
  "/api/cron/fuel-price",
]);

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (SELF_AUTHENTICATING_API_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const hasValidSession = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (pathname.startsWith("/api/")) {
    const apiSecret = request.headers.get("x-api-secret");
    const configuredSecret = process.env.API_SECRET;
    const hasValidApiSecret =
      !!apiSecret && !!configuredSecret && safeCompare(apiSecret, configuredSecret);

    if (hasValidApiSecret || hasValidSession) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (PUBLIC_PAGE_PATHS.has(pathname)) {
    if (hasValidSession) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!hasValidSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
