import type { PortalRole, PortalSession } from "./types";

export const PORTAL_COOKIE = "pt";

const WAREHOUSE_ONLY = ["/dashboard", "/cau-hinh", "/ql-du-lieu"];

export function sessionFromCookieValue(
  value: string | undefined
): PortalSession {
  if (!value) {
    return {
      role: "anonymous",
      carrierId: null,
      carrierCode: null,
      carrierName: null,
    };
  }
  const parts = value.split(":");
  const role = parts[0] as PortalRole;
  if (role === "warehouse" || role === "driver") {
    return {
      role,
      carrierId: null,
      carrierCode: null,
      carrierName: null,
    };
  }
  if (role === "carrier" && parts[1]) {
    const carrierId = Number(parts[1]);
    return {
      role: "carrier",
      carrierId: Number.isNaN(carrierId) ? null : carrierId,
      carrierCode: parts[2] ? decodeURIComponent(parts[2]) : null,
      carrierName: parts[3] ? decodeURIComponent(parts[3]) : null,
    };
  }
  return {
    role: "anonymous",
    carrierId: null,
    carrierCode: null,
    carrierName: null,
  };
}

export function encodePortalCookie(session: PortalSession): string {
  if (session.role === "carrier" && session.carrierId) {
    return `carrier:${session.carrierId}:${encodeURIComponent(session.carrierCode ?? "")}:${encodeURIComponent(session.carrierName ?? "")}`;
  }
  return session.role;
}

export function canAccessPath(pathname: string, role: PortalRole): boolean {
  if (role === "warehouse") return true;
  if (role === "anonymous") {
    return pathname === "/" || pathname.startsWith("/r/");
  }

  if (WAREHOUSE_ONLY.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return false;
  }

  if (role === "driver") {
    if (pathname === "/" || pathname.startsWith("/ke-hoach/dashboard")) {
      return true;
    }
    if (
      pathname === "/ke-hoach" ||
      (pathname.startsWith("/ke-hoach/") &&
        !pathname.startsWith("/ke-hoach/dashboard"))
    ) {
      return false;
    }
    return pathname === "/";
  }

  if (role === "carrier") {
    return pathname === "/" || pathname.startsWith("/ke-hoach");
  }

  return false;
}

export function landingPathForRole(role: PortalRole): string {
  if (role === "warehouse") return "/dashboard";
  if (role === "carrier") return "/ke-hoach";
  if (role === "driver") return "/";
  return "/";
}

export function isPastDate(date: string): boolean {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return date < `${y}-${m}-${d}`;
}

export function carrierCanEditDate(
  session: PortalSession,
  planDate: string
): boolean {
  if (session.role === "warehouse") return true;
  if (session.role === "carrier") return !isPastDate(planDate);
  return false;
}
