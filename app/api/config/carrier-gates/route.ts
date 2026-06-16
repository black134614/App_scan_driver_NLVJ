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
  const gateIdRaw = req.nextUrl.searchParams.get("gateId");

  if (!Number.isInteger(carrierId) || carrierId <= 0) {
    return NextResponse.json({ error: "Thiếu carrierId" }, { status: 400 });
  }

  if (gateIdRaw !== null && gateIdRaw !== "") {
    const gateId = Number(gateIdRaw);
    if (!Number.isInteger(gateId) || gateId <= 0) {
      return NextResponse.json({ error: "gateId không hợp lệ" }, { status: 400 });
    }
    const config = await getCarrierSlotConfig(carrierId, gateId);
    return NextResponse.json(config);
  }

  const gateIds = await getCarrierGateIds(carrierId);
  return NextResponse.json({
    carrierId,
    gateIds,
  });
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
    const gateIds = body.gateIds
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);
    await setCarrierGates(body.carrierId, gateIds);
    const saved = await getCarrierGateIds(body.carrierId);
    return NextResponse.json({ ok: true, carrierId: body.carrierId, gateIds: saved });
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
