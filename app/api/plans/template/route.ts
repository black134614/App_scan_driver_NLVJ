import { NextRequest, NextResponse } from "next/server";
import { todayDateString } from "@/lib/plan-parse";
import { buildPlanImportTemplate } from "@/lib/plan-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const date =
    req.nextUrl.searchParams.get("date")?.trim() || todayDateString();
  const buffer = buildPlanImportTemplate(date);
  const filename = `mau-ke-hoach-van-tai-${date}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
