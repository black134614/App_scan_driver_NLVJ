import { NextRequest, NextResponse } from "next/server";
import {
  forbidden,
  getSessionFromRequest,
} from "@/lib/api-auth";
import { getCarrier } from "@/lib/config";
import { listPlanOrdersByDate } from "@/lib/plans";
import { todayDateString } from "@/lib/plan-parse";
import { listSessions } from "@/lib/sessions";
import type { PlanOrderRow, SessionWithOrders } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizePlate(plate: string): string {
  return plate.trim().toUpperCase();
}

function sessionMatchesDate(session: SessionWithOrders, date: string): boolean {
  const created = session.created_at.slice(0, 10);
  return created === date;
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (session.role !== "warehouse" && session.role !== "carrier") {
    return forbidden();
  }

  const date =
    req.nextUrl.searchParams.get("date")?.trim() || todayDateString();
  const plate = req.nextUrl.searchParams.get("plate")?.trim();
  if (!plate) {
    return NextResponse.json({ error: "Thiếu biển số xe" }, { status: 400 });
  }

  const normPlate = normalizePlate(plate);
  const carrierId =
    session.role === "carrier" ? session.carrierId : null;

  const allOrders = await listPlanOrdersByDate(date, carrierId);
  const plan = allOrders.filter(
    (o) => o.vehicle_plate && normalizePlate(o.vehicle_plate) === normPlate
  );

  const sessions = await listSessions();
  const driverSession =
    sessions.find(
      (s) =>
        normalizePlate(s.vehicle_plate) === normPlate &&
        sessionMatchesDate(s, date)
    ) ?? null;

  let carrierName: string | null = null;
  const carrierIds = [
    ...new Set(
      plan
        .map((o: PlanOrderRow) => o.carrier_id)
        .filter((id): id is number => id != null)
    ),
  ];
  if (carrierIds.length === 1) {
    const carrier = await getCarrier(carrierIds[0]);
    carrierName = carrier?.name ?? null;
  } else if (carrierIds.length > 1) {
    const names: string[] = [];
    for (const id of carrierIds) {
      const c = await getCarrier(id);
      if (c?.name) names.push(c.name);
    }
    carrierName = names.length > 0 ? names.join(", ") : null;
  }

  return NextResponse.json({
    plan,
    session: driverSession,
    carrierName,
    date,
    plate: normPlate,
  });
}
