import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/api-auth";
import { todayDateString } from "@/lib/plan-parse";
import {
  buildCarrierImportTemplate,
  buildPlanImportTemplate,
} from "@/lib/plan-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const date =
    req.nextUrl.searchParams.get("date")?.trim() || todayDateString();

  const isCarrier = session.role === "carrier";
  const buffer = isCarrier
    ? buildCarrierImportTemplate(date)
    : buildPlanImportTemplate(date);
  const filename = isCarrier
    ? `mau-ke-hoach-nvt-${date}.xlsx`
    : `mau-ke-hoach-van-tai-${date}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
