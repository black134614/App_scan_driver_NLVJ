import { NextRequest, NextResponse } from "next/server";
import {
  PORTAL_COOKIE,
  canAccessPath,
  sessionFromCookieValue,
} from "@/lib/access-shared";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/r/") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const session = sessionFromCookieValue(
    request.cookies.get(PORTAL_COOKIE)?.value
  );

  if (!canAccessPath(pathname, session.role)) {
    if (session.role === "anonymous") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    if (session.role === "driver") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    if (session.role === "carrier") {
      return NextResponse.redirect(new URL("/ke-hoach", request.url));
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
