import { NextRequest, NextResponse } from "next/server";
import {
  assertWarehouse,
  forbidden,
  getSessionFromRequest,
} from "@/lib/api-auth";
import { createCarrier, listCarriers } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const denied = assertWarehouse(session);
  if (denied) return denied;
  const carriers = await listCarriers();
  return NextResponse.json({ carriers });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const denied = assertWarehouse(session);
  if (denied) return denied;

  let body: { code?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }
  if (!body.code?.trim() || !body.name?.trim()) {
    return forbidden("Thiếu mã hoặc tên nhà vận tải");
  }
  try {
    const carrier = await createCarrier({
      code: body.code,
      name: body.name,
    });
    return NextResponse.json({ carrier }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 400 }
    );
  }
}
