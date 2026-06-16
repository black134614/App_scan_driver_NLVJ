import { NextRequest, NextResponse } from "next/server";
import {
  assertWarehouse,
  getSessionFromRequest,
} from "@/lib/api-auth";
import { getPlanOrder, setPlanOrderManualPicked } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(req);
  const denied = assertWarehouse(session);
  if (denied) return denied;

  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId)) {
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  }

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const existing = await getPlanOrder(orderId);
  if (!existing) {
    return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  }

  let manualPicked: -1 | 0 | 1;
  if (body.action === "mark_picked") {
    manualPicked = 1;
  } else if (body.action === "clear_picked") {
    manualPicked = (existing.manual_picked ?? 0) === 1 ? 0 : -1;
  } else {
    return NextResponse.json(
      { error: "action phải là mark_picked hoặc clear_picked" },
      { status: 400 }
    );
  }

  const order = await setPlanOrderManualPicked(orderId, manualPicked);
  return NextResponse.json({ order });
}
