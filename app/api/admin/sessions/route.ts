import { NextRequest, NextResponse } from "next/server";
import { adminUnauthorized, getAdminSecret, verifyAdminRequest } from "@/lib/admin-auth";
import { adminCreateSession, parsePageSize, searchSessions } from "@/lib/sessions";
import type { AdminSessionInput, SessionStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseBody(body: unknown): AdminSessionInput | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const driverName = String(b.driverName ?? "").trim();
  const vehiclePlate = String(b.vehiclePlate ?? "").trim();
  const gateCode = String(b.gateCode ?? "").trim();
  if (!driverName || !vehiclePlate || !gateCode) return null;

  const orderCodes = Array.isArray(b.orderCodes)
    ? b.orderCodes.map(String)
    : typeof b.orderCodes === "string"
      ? b.orderCodes.split(/[\n,;]+/).map((s) => s.trim())
      : [];

  return {
    driverName,
    vehiclePlate,
    gateCode,
    status: b.status as SessionStatus | undefined,
    createdAt: (b.createdAt as string | null) ?? undefined,
    exportStartedAt: (b.exportStartedAt as string | null) ?? undefined,
    exportEstimatedAt: (b.exportEstimatedAt as string | null) ?? undefined,
    exportFinishedAt: (b.exportFinishedAt as string | null) ?? undefined,
    orderCodes,
  };
}

export async function GET(req: NextRequest) {
  if (!verifyAdminRequest(req)) return adminUnauthorized();

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = parsePageSize(searchParams.get("limit"));

  const result = searchSessions({}, page, limit);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  if (!verifyAdminRequest(req)) return adminUnauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const input = parseBody(body);
  if (!input) {
    return NextResponse.json(
      { error: "Thiếu tên tài xế, biển số hoặc mã cổng" },
      { status: 400 }
    );
  }

  const session = adminCreateSession(input);
  return NextResponse.json({ session }, { status: 201 });
}

/** Kiểm tra mã PIN (POST { pin }) */
export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const pin = String((body as { pin?: string }).pin ?? "");
  if (pin !== getAdminSecret()) {
    return NextResponse.json({ error: "Mã PIN không đúng" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
