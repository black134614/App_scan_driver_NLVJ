import { NextRequest, NextResponse } from "next/server";
import {
  encodePortalCookie,
  landingPathForRole,
  PORTAL_COOKIE,
  resolveToken,
} from "@/lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const session = await resolveToken(token);
  if (!session) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const landing = landingPathForRole(session.role);
  const res = NextResponse.redirect(new URL(landing, req.url));
  res.cookies.set(PORTAL_COOKIE, encodePortalCookie(session), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return res;
}
