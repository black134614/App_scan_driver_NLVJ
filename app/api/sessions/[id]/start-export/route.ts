import { NextResponse } from "next/server";
import { startExport } from "@/lib/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId)) {
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  }

  const session = startExport(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Không tìm thấy phiên" }, { status: 404 });
  }
  return NextResponse.json({ session });
}
