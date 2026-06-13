import { NextRequest, NextResponse } from "next/server";
import { addOrder, getSession } from "@/lib/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { orderCode } = (body ?? {}) as { orderCode?: string };
  const code = orderCode?.trim();
  if (!code) {
    return NextResponse.json({ error: "Thiếu mã đơn hàng" }, { status: 400 });
  }

  const result = addOrder(sessionId, code);
  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json(
        { error: "Không tìm thấy phiên" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: "Đơn hàng đã được quét trước đó", code: "duplicate" },
      { status: 409 }
    );
  }

  const session = getSession(sessionId);
  return NextResponse.json({ order: result.order, session }, { status: 201 });
}
