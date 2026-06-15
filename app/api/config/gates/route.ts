import { NextRequest, NextResponse } from "next/server";
import {
  assertWarehouse,
  getSessionFromRequest,
} from "@/lib/api-auth";
import { createGate, listGates } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (session.role === "carrier" && session.carrierId) {
    const { getCarrierGates } = await import("@/lib/config");
    const gates = await getCarrierGates(session.carrierId);
    return NextResponse.json({ gates });
  }
  if (session.role !== "warehouse") {
    return NextResponse.json({ gates: [] });
  }
  const gates = await listGates();
  return NextResponse.json({ gates });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const denied = assertWarehouse(session);
  if (denied) return denied;

  let body: {
    code?: string;
    name?: string;
    startMinutes?: number;
    endMinutes?: number;
    loadMinutes?: number;
    daysMask?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }
  if (!body.code?.trim() || !body.name?.trim()) {
    return NextResponse.json({ error: "Thiếu mã hoặc tên cổng" }, { status: 400 });
  }
  const gate = await createGate({
    code: body.code,
    name: body.name,
    startMinutes: body.startMinutes ?? 300,
    endMinutes: body.endMinutes ?? 720,
    loadMinutes: body.loadMinutes ?? 30,
    daysMask: body.daysMask,
  });
  return NextResponse.json({ gate }, { status: 201 });
}
