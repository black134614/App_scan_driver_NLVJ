import { NextRequest, NextResponse } from "next/server";
import { getPortalSession, getPortalSessionFromRequest } from "./access";
import { carrierCanEditDate } from "./access-shared";
import type { PortalRole, PortalSession } from "./types";

export function requireWarehouse(session: PortalSession): boolean {
  return session.role === "warehouse";
}

export function requireCarrierOrWarehouse(session: PortalSession): boolean {
  return session.role === "warehouse" || session.role === "carrier";
}

export function forbidden(message = "Không có quyền truy cập") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function unauthorized(message = "Không có quyền truy cập") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export async function getSessionFromRequest(
  req: NextRequest
): Promise<PortalSession> {
  return getPortalSessionFromRequest(req);
}

export async function getSession(): Promise<PortalSession> {
  return getPortalSession();
}

export function assertCarrierEdit(
  session: PortalSession,
  planDate: string
): NextResponse | null {
  if (!carrierCanEditDate(session, planDate)) {
    return forbidden("Không được sửa/xóa kế hoạch ngày đã qua");
  }
  if (session.role === "carrier" || session.role === "warehouse") {
    return null;
  }
  return forbidden();
}

export function assertWarehouse(session: PortalSession): NextResponse | null {
  if (!requireWarehouse(session)) return forbidden();
  return null;
}

export function filterOrdersByCarrier<T extends { carrier_id: number | null; gate_code: string }>(
  orders: T[],
  session: PortalSession,
  carrierGateCodes?: string[]
): T[] {
  if (session.role === "warehouse") return orders;
  if (session.role === "carrier" && session.carrierId) {
    if (carrierGateCodes) {
      return orders.filter((o) => carrierGateCodes.includes(o.gate_code));
    }
    return orders.filter(
      (o) => o.carrier_id === session.carrierId || o.carrier_id === null
    );
  }
  return orders;
}

export type { PortalRole, PortalSession };
