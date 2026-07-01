import { NextRequest, NextResponse } from "next/server";
import { forbidden, getSessionFromRequest } from "@/lib/api-auth";
import { getCarrierImportContext } from "@/lib/plan-import-context";
import { todayDateString } from "@/lib/plan-parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (session.role !== "carrier" || !session.carrierId) {
    return forbidden("Chỉ nhà vận tải mới dùng được API này");
  }

  const date =
    req.nextUrl.searchParams.get("date")?.trim() || todayDateString();

  const ctx = await getCarrierImportContext(session.carrierId, date);
  return NextResponse.json(ctx);
}
