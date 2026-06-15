import { NextRequest, NextResponse } from "next/server";
import { todayDateString } from "@/lib/plan-parse";
import {
  assertCarrierEdit,
  forbidden,
  getSessionFromRequest,
} from "@/lib/api-auth";
import {
  createPlanOrderWithAuth,
  getPlanDayView,
  listPlanOrdersByDate,
} from "@/lib/plans";
import type { PlanOrderInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseInput(body: unknown): PlanOrderInput | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const planDate = String(b.planDate ?? b.plan_date ?? "").trim();
  const gateCode = String(b.gateCode ?? b.gate_code ?? "").trim();
  const expectedTime = String(b.expectedTime ?? b.expected_time ?? "").trim();
  const orderCode = String(b.orderCode ?? b.order_code ?? "").trim();
  if (!planDate || !gateCode || !expectedTime || !orderCode) return null;

  const tonnageRaw = b.tonnage ?? b.soTan;
  const tonnage =
    tonnageRaw == null || tonnageRaw === ""
      ? null
      : Number(String(tonnageRaw).replace(",", "."));

  return {
    planDate,
    gateCode,
    expectedTime,
    orderCode,
    tonnage: tonnage != null && !Number.isNaN(tonnage) ? tonnage : null,
    vehiclePlate:
      String(b.vehiclePlate ?? b.vehicle_plate ?? b.soXe ?? "").trim() ||
      null,
    driverName:
      String(b.driverName ?? b.driver_name ?? b.taiXe ?? "").trim() || null,
    source: (b.source as PlanOrderInput["source"]) ?? "manual",
    carrierId:
      b.carrierId != null ? Number(b.carrierId) : null,
  };
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const date =
    req.nextUrl.searchParams.get("date")?.trim() || todayDateString();

  const carrierId =
    session.role === "carrier" ? session.carrierId : null;

  if (req.nextUrl.searchParams.get("list") === "1") {
    const orders = await listPlanOrdersByDate(date, carrierId);
    return NextResponse.json({ orders, date });
  }

  const view = await getPlanDayView(date, carrierId);
  return NextResponse.json(view);
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (session.role !== "warehouse" && session.role !== "carrier") {
    return forbidden();
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const ordersInput = (body as { orders?: unknown[] }).orders;
  if (Array.isArray(ordersInput)) {
    const created = [];
    for (const item of ordersInput) {
      const input = parseInput(item);
      if (!input) {
        return NextResponse.json(
          { error: "Thiếu trường bắt buộc trong danh sách đơn" },
          { status: 400 }
        );
      }
      const denied = assertCarrierEdit(session, input.planDate);
      if (denied) return denied;
      try {
        created.push(await createPlanOrderWithAuth(session, input));
      } catch (e) {
        return NextResponse.json(
          { error: (e as Error).message },
          { status: 400 }
        );
      }
    }
    return NextResponse.json({ orders: created }, { status: 201 });
  }

  const input = parseInput(body);
  if (!input) {
    return NextResponse.json(
      { error: "Thiếu ngày, cổng, giờ hoặc mã đơn" },
      { status: 400 }
    );
  }

  const denied = assertCarrierEdit(session, input.planDate);
  if (denied) return denied;

  try {
    const order = await createPlanOrderWithAuth(session, input);
    return NextResponse.json({ order }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
