import { NextRequest, NextResponse } from "next/server";
import {
  assertWarehouse,
  getSessionFromRequest,
} from "@/lib/api-auth";
import { getCarrier, regenerateCarrierToken } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(req);
  const denied = assertWarehouse(session);
  if (denied) return denied;

  const { id } = await params;
  const carrierId = Number(id);
  const carrier = await regenerateCarrierToken(carrierId);
  if (!carrier) {
    return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  }
  return NextResponse.json({ carrier });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(req);
  const denied = assertWarehouse(session);
  if (denied) return denied;

  const { id } = await params;
  const carrier = await getCarrier(Number(id));
  if (!carrier) {
    return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  }
  return NextResponse.json({ carrier });
}
