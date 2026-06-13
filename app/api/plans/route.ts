import { NextRequest, NextResponse } from "next/server";
import { todayDateString } from "@/lib/plan-parse";
import {
  createPlanOrder,
  getPlanDayView,
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
  };
}

export async function GET(req: NextRequest) {
  const date =
    req.nextUrl.searchParams.get("date")?.trim() || todayDateString();
  const view = await getPlanDayView(date);
  return NextResponse.json(view);
}

export async function POST(req: NextRequest) {
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
      created.push(await createPlanOrder(input));
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

  const order = await createPlanOrder(input);
  return NextResponse.json({ order }, { status: 201 });
}
