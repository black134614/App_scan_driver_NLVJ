import { NextRequest, NextResponse } from "next/server";
import { adminUnauthorized, verifyAdminRequest } from "@/lib/admin-auth";
import {
  deleteSession,
  getSession,
  syncSessionOrders,
  updateSession,
} from "@/lib/sessions";
import type { AdminOrderInput, AdminSessionInput, SessionStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseSessionBody(body: unknown): AdminSessionInput | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const driverName = String(b.driverName ?? "").trim();
  const vehiclePlate = String(b.vehiclePlate ?? "").trim();
  const gateCode = String(b.gateCode ?? "").trim();
  if (!driverName || !vehiclePlate || !gateCode) return null;

  return {
    driverName,
    vehiclePlate,
    gateCode,
    status: b.status as SessionStatus | undefined,
    createdAt: (b.createdAt as string | null) ?? undefined,
    exportStartedAt: (b.exportStartedAt as string | null) ?? undefined,
    exportEstimatedAt: (b.exportEstimatedAt as string | null) ?? undefined,
    exportFinishedAt: (b.exportFinishedAt as string | null) ?? undefined,
  };
}

function parseOrders(body: unknown): AdminOrderInput[] {
  const b = body as { orders?: AdminOrderInput[] };
  if (!Array.isArray(b.orders)) return [];
  return b.orders
    .map((o) => ({
      id: o.id ? Number(o.id) : undefined,
      orderCode: String(o.orderCode ?? "").trim(),
    }))
    .filter((o) => o.orderCode);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminRequest(req)) return adminUnauthorized();

  const { id } = await params;
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId)) {
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  }

  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Không tìm thấy phiên" }, { status: 404 });
  }
  return NextResponse.json({ session });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminRequest(req)) return adminUnauthorized();

  const { id } = await params;
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId)) {
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const input = parseSessionBody(body);
  if (!input) {
    return NextResponse.json(
      { error: "Thiếu tên tài xế, biển số hoặc mã cổng" },
      { status: 400 }
    );
  }

  const session = await updateSession(sessionId, input);
  if (!session) {
    return NextResponse.json({ error: "Không tìm thấy phiên" }, { status: 404 });
  }

  const orders = parseOrders(body);
  const updated = await syncSessionOrders(sessionId, orders);
  return NextResponse.json({ session: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminRequest(req)) return adminUnauthorized();

  const { id } = await params;
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId)) {
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  }

  const removed = await deleteSession(sessionId);
  if (!removed) {
    return NextResponse.json({ error: "Không tìm thấy phiên" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
