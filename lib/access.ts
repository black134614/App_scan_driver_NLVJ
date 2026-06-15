import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import {
  PORTAL_COOKIE,
  sessionFromCookieValue,
} from "./access-shared";
import { dbGet } from "./db";
import type { CarrierRow, PortalSession } from "./types";

export {
  PORTAL_COOKIE,
  canAccessPath,
  carrierCanEditDate,
  encodePortalCookie,
  isPastDate,
  landingPathForRole,
  sessionFromCookieValue,
} from "./access-shared";

export async function resolveToken(
  token: string
): Promise<PortalSession | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const portal = await dbGet<{ kind: string }>(
    "SELECT kind FROM portal_links WHERE token = ?",
    [trimmed]
  );
  if (portal) {
    if (portal.kind === "warehouse") {
      return {
        role: "warehouse",
        carrierId: null,
        carrierCode: null,
        carrierName: null,
      };
    }
    if (portal.kind === "driver") {
      return {
        role: "driver",
        carrierId: null,
        carrierCode: null,
        carrierName: null,
      };
    }
  }

  const carrier = await dbGet<CarrierRow>(
    "SELECT * FROM carriers WHERE token = ? AND active = 1",
    [trimmed]
  );
  if (carrier) {
    return {
      role: "carrier",
      carrierId: carrier.id,
      carrierCode: carrier.code,
      carrierName: carrier.name,
    };
  }

  return null;
}

export async function getPortalSession(): Promise<PortalSession> {
  const store = await cookies();
  return sessionFromCookieValue(store.get(PORTAL_COOKIE)?.value);
}

export function getPortalSessionFromRequest(
  req: NextRequest
): PortalSession {
  return sessionFromCookieValue(req.cookies.get(PORTAL_COOKIE)?.value);
}
