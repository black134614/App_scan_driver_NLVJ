import { NextRequest, NextResponse } from "next/server";
import {
  assertWarehouse,
  forbidden,
  getSessionFromRequest,
} from "@/lib/api-auth";
import { exportPlanDay } from "@/lib/plan-export";
import { todayDateString } from "@/lib/plan-parse";
import { listPlanOrdersByDate } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (session.role !== "warehouse" && session.role !== "carrier") {
    return forbidden();
  }

  const date =
    req.nextUrl.searchParams.get("date")?.trim() || todayDateString();
  const carrierId =
    session.role === "carrier" ? session.carrierId : null;

  const orders = await listPlanOrdersByDate(date, carrierId);
  const buffer = exportPlanDay(orders);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ke-hoach-${date}.xlsx"`,
    },
  });
}
