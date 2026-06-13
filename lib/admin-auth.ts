import { NextRequest, NextResponse } from "next/server";

const ADMIN_HEADER = "x-admin-key";

export function getAdminSecret(): string {
  return process.env.ADMIN_SECRET ?? "gate-admin-2026";
}

export function verifyAdminRequest(req: NextRequest): boolean {
  const key = req.headers.get(ADMIN_HEADER);
  return key === getAdminSecret();
}

export function adminUnauthorized() {
  return NextResponse.json({ error: "Không có quyền truy cập" }, { status: 401 });
}

export { ADMIN_HEADER };
