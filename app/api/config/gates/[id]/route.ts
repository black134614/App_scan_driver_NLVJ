import { NextRequest, NextResponse } from "next/server";
import {
  assertWarehouse,
  getSessionFromRequest,
} from "@/lib/api-auth";
import { deleteGate, getGate, updateGate } from "@/lib/config";

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
  let body: {
    code?: string;
    name?: string;
    startMinutes?: number;
    endMinutes?: number;
    loadMinutes?: number;
    daysMask?: number;
    active?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const gate = await updateGate(Number(id), body);
  if (!gate) {
    return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  }
  return NextResponse.json({ gate });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(req);
  const denied = assertWarehouse(session);
  if (denied) return denied;

  const { id } = await params;
  const removed = await deleteGate(Number(id));
  if (!removed) {
    return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(req);
  const denied = assertWarehouse(session);
  if (denied) return denied;

  const { id } = await params;
  const gate = await getGate(Number(id));
  if (!gate) {
    return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  }
  return NextResponse.json({ gate });
}
