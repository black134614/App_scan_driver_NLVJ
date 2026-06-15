import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/api-auth";
import { getCarrierGates } from "@/lib/config";
import { getAvailableSlotsForCarrier } from "@/lib/slots";
import { todayDateString } from "@/lib/plan-parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const date =
    req.nextUrl.searchParams.get("date")?.trim() || todayDateString();
  const gateId = Number(req.nextUrl.searchParams.get("gateId"));
  const excludePlate =
    req.nextUrl.searchParams.get("excludePlate")?.trim() || null;

  if (!Number.isInteger(gateId)) {
    return NextResponse.json({ error: "Thiếu gateId" }, { status: 400 });
  }

  if (session.role === "carrier" && session.carrierId) {
    const gates = await getCarrierGates(session.carrierId);
    const gate = gates.find((g) => g.id === gateId);
    if (!gate) {
      return NextResponse.json({ error: "Cổng không được phép" }, { status: 403 });
    }
    const slots = await getAvailableSlotsForCarrier(
      date,
      session.carrierId,
      gate,
      excludePlate
    );
    return NextResponse.json({ slots });
  }

  if (session.role === "warehouse") {
    const { getGate } = await import("@/lib/config");
    const { getAllSlotsForGate } = await import("@/lib/slots");
    const gate = await getGate(gateId);
    if (!gate) {
      return NextResponse.json({ error: "Không tìm thấy cổng" }, { status: 404 });
    }
    const all = await getAllSlotsForGate(gate, date);
    const { getOccupiedSlotMinutes } = await import("@/lib/slots");
    const occupied = await getOccupiedSlotMinutes(
      date,
      gate.code,
      excludePlate
    );
    const slots = all.filter((s) => !occupied.has(s.minutes));
    return NextResponse.json({ slots });
  }

  return NextResponse.json({ slots: [] });
}
