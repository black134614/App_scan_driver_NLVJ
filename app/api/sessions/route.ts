import { NextRequest, NextResponse } from "next/server";
import {
  createSession,
  getFilterOptions,
  listSessions,
  parsePageSize,
  searchSessions,
} from "@/lib/sessions";
import type { SessionFilters } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseFilters(searchParams: URLSearchParams): SessionFilters {
  return {
    gate: searchParams.get("gate") ?? undefined,
    driver: searchParams.get("driver") ?? undefined,
    orderCode: searchParams.get("orderCode") ?? undefined,
    exportDate: searchParams.get("exportDate") ?? undefined,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const pageParam = searchParams.get("page");
  const limitParam = searchParams.get("limit");

  if (pageParam !== null || limitParam !== null) {
    const filters = parseFilters(searchParams);
    const page = Math.max(1, Number(pageParam) || 1);
    const limit = parsePageSize(limitParam);
    const result = await searchSessions(filters, page, limit);
    const filterOptions = await getFilterOptions();
    return NextResponse.json({ ...result, filterOptions });
  }

  const sessions = await listSessions();
  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const { driverName, vehiclePlate, gateCode } = (body ?? {}) as {
    driverName?: string;
    vehiclePlate?: string;
    gateCode?: string;
  };

  const driver = driverName?.trim();
  const plate = vehiclePlate?.trim().toUpperCase();
  const gate = gateCode?.trim();

  if (!driver || !plate || !gate) {
    return NextResponse.json(
      { error: "Thiếu tên tài xế, biển số xe hoặc mã cổng" },
      { status: 400 }
    );
  }

  const session = await createSession(driver, plate, gate);
  return NextResponse.json({ session }, { status: 201 });
}
