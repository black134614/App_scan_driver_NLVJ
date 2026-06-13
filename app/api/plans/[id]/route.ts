import { NextRequest, NextResponse } from "next/server";
import { deletePlanOrder, getPlanOrder, updatePlanOrder } from "@/lib/plans";
import type { PlanOrderInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseInput(body: unknown): PlanOrderInput | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const planDate = String(b.planDate ?? "").trim();
  const gateCode = String(b.gateCode ?? "").trim();
  const expectedTime = String(b.expectedTime ?? "").trim();
  const orderCode = String(b.orderCode ?? "").trim();
  if (!planDate || !gateCode || !expectedTime || !orderCode) return null;

  const tonnageRaw = b.tonnage;
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
    vehiclePlate: String(b.vehiclePlate ?? "").trim() || null,
    driverName: String(b.driverName ?? "").trim() || null,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId)) {
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  }
  const order = await getPlanOrder(orderId);
  if (!order) {
    return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  }
  return NextResponse.json({ order });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId)) {
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const input = parseInput(body);
  if (!input) {
    return NextResponse.json(
      { error: "Thiếu ngày, cổng, giờ hoặc mã đơn" },
      { status: 400 }
    );
  }

  const order = await updatePlanOrder(orderId, input);
  if (!order) {
    return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  }
  return NextResponse.json({ order });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId)) {
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  }
  const removed = await deletePlanOrder(orderId);
  if (!removed) {
    return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
