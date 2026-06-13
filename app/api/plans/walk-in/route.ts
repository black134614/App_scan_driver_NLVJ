import { NextRequest, NextResponse } from "next/server";
import { todayDateString } from "@/lib/plan-parse";
import { registerWalkInTruck } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const planDate = String(b.planDate ?? b.date ?? todayDateString()).trim();
  const vehiclePlate = String(b.vehiclePlate ?? b.soXe ?? "").trim();
  const driverName = String(b.driverName ?? b.taiXe ?? "").trim() || null;
  const gateCode = String(b.gateCode ?? b.cong ?? "").trim() || null;
  const expectedTime = String(b.expectedTime ?? b.gio ?? "").trim() || null;
  const orderCodes = Array.isArray(b.orderCodes)
    ? b.orderCodes.map(String)
    : undefined;

  if (!vehiclePlate) {
    return NextResponse.json({ error: "Thiếu biển số xe" }, { status: 400 });
  }

  try {
    const result = await registerWalkInTruck({
      planDate,
      vehiclePlate,
      driverName,
      gateCode,
      expectedTime,
      orderCodes,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 400 }
    );
  }
}
