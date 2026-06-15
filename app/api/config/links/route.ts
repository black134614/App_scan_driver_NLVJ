import { NextRequest, NextResponse } from "next/server";
import {
  assertWarehouse,
  getSessionFromRequest,
} from "@/lib/api-auth";
import { listPortalLinks, regeneratePortalLink } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const denied = assertWarehouse(session);
  if (denied) return denied;

  const links = await listPortalLinks();
  const origin = req.nextUrl.origin;
  const withUrls = links.map((l) => ({
    ...l,
    url: `${origin}/r/${l.token}`,
  }));
  return NextResponse.json({ links: withUrls });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const denied = assertWarehouse(session);
  if (denied) return denied;

  let body: { kind?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }
  if (!body.kind) {
    return NextResponse.json({ error: "Thiếu kind" }, { status: 400 });
  }
  const link = await regeneratePortalLink(body.kind);
  if (!link) {
    return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  }
  const origin = req.nextUrl.origin;
  return NextResponse.json({
    link: { ...link, url: `${origin}/r/${link.token}` },
  });
}
