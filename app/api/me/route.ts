import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getPortalSession();
  return NextResponse.json({
    role: session.role,
    carrierId: session.carrierId,
    carrierCode: session.carrierCode,
    carrierName: session.carrierName,
  });
}
