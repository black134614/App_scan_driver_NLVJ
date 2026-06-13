import { NextResponse } from "next/server";
import { deleteOrder, getSession } from "@/lib/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; orderId: string }> }
) {
  const { id, orderId } = await params;
  const sessionId = Number(id);
  const oid = Number(orderId);
  if (!Number.isInteger(sessionId) || !Number.isInteger(oid)) {
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  }

  const removed = await deleteOrder(sessionId, oid);
  if (!removed) {
    return NextResponse.json({ error: "Không tìm thấy đơn" }, { status: 404 });
  }

  const session = await getSession(sessionId);
  return NextResponse.json({ session });
}
