import { NextRequest, NextResponse } from "next/server";
import {
  assertWarehouse,
  getSessionFromRequest,
} from "@/lib/api-auth";
import {
  getCarrierGateIds,
  getCarrierSlotConfig,
  setCarrierGates,
  toggleHiddenSlot,
} from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const denied = assertWarehouse(session);
  if (denied) return denied;

  const carrierId = Number(req.nextUrl.searchParams.get("carrierId"));
  const gateId = Number(req.nextUrl.searchParams.get("gateId"));

  if (!Number.isInteger(carrierId)) {
    return NextResponse.json({ error: "Thiếu carrierId" }, { status: 400 });
  }

  if (Number.isInteger(gateId)) {
    const config = await getCarrierSlotConfig(carrierId, gateId);
    return NextResponse.json(config);
  }

  const gateIds = await getCarrierGateIds(carrierId);
  return NextResponse.json({ gateIds });
}

export async function PUT(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const denied = assertWarehouse(session);
  if (denied) return denied;

  let body: {
    carrierId?: number;
    gateIds?: number[];
    gateId?: number;
    slotMinutes?: number;
    hidden?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  if (body.carrierId && body.gateIds) {
    await setCarrierGates(body.carrierId, body.gateIds);
    return NextResponse.json({ ok: true });
  }

  if (
    body.carrierId &&
    body.gateId !== undefined &&
    body.slotMinutes !== undefined &&
    body.hidden !== undefined
  ) {
    await toggleHiddenSlot(
      body.carrierId,
      body.gateId,
      body.slotMinutes,
      body.hidden
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Thiếu dữ liệu" }, { status: 400 });
}
