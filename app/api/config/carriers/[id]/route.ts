import { NextRequest, NextResponse } from "next/server";
import {
  assertWarehouse,
  getSessionFromRequest,
} from "@/lib/api-auth";
import {
  deleteCarrier,
  updateCarrier,
} from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(req);
  const denied = assertWarehouse(session);
  if (denied) return denied;

  const { id } = await params;
  const carrierId = Number(id);
  if (!Number.isInteger(carrierId)) {
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  }

  let body: { code?: string; name?: string; active?: boolean; color_key?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  try {
    const carrier = await updateCarrier(carrierId, body);
    if (!carrier) {
      return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
    }
    return NextResponse.json({ carrier });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 400 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(req);
  const denied = assertWarehouse(session);
  if (denied) return denied;

  const { id } = await params;
  const carrierId = Number(id);
  const removed = await deleteCarrier(carrierId);
  if (!removed) {
    return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
