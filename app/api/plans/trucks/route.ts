import { NextRequest, NextResponse } from "next/server";
import { todayDateString } from "@/lib/plan-parse";
import { listTrucksForDriver } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const date =
    req.nextUrl.searchParams.get("date")?.trim() || todayDateString();
  const trucks = await listTrucksForDriver(date);
  return NextResponse.json({ date, trucks });
}
