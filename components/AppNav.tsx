"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { PortalRole } from "@/lib/types";

const ALL_LINKS = [
  { href: "/", label: "Tài xế", roles: ["warehouse", "carrier", "driver", "anonymous"] as PortalRole[] },
  { href: "/dashboard", label: "Dashboard kho", roles: ["warehouse"] as PortalRole[] },
  { href: "/ke-hoach", label: "Kế hoạch VT", roles: ["warehouse", "carrier"] as PortalRole[] },
  { href: "/ke-hoach/dashboard", label: "Dashboard KH", roles: ["warehouse", "carrier", "driver"] as PortalRole[] },
  { href: "/cau-hinh", label: "Cấu hình", roles: ["warehouse"] as PortalRole[] },
  { href: "/ql-du-lieu", label: "QL dữ liệu", roles: ["warehouse"] as PortalRole[] },
];

function getActiveHref(pathname: string, links: typeof ALL_LINKS): string {
  const visible = links;
  const exact = visible.find((l) => l.href === pathname);
  if (exact) return exact.href;

  const nested = visible
    .filter(
      (l) => l.href !== "/" && pathname.startsWith(`${l.href}/`)
    )
    .sort((a, b) => b.href.length - a.href.length)[0];

  return nested?.href ?? "";
}

export default function AppNav() {
  const pathname = usePathname();
  const [role, setRole] = useState<PortalRole>("anonymous");
  const [carrierName, setCarrierName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setRole(d.role ?? "anonymous");
        setCarrierName(d.carrierName ?? null);
      })
      .catch(() => {});
  }, []);

  const links = ALL_LINKS.filter((l) => l.roles.includes(role));
  const activeHref = getActiveHref(pathname, links);

  return (
    <div className="mb-4">
      {carrierName && (
        <p className="mb-2 text-xs font-semibold text-blue-700">
          Nhà vận tải: {carrierName}
        </p>
      )}
      <nav className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="flex min-w-max gap-2 rounded-xl bg-slate-100 p-1.5">
          {links.map((l) => {
            const active = l.href === activeHref;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors sm:text-sm ${
                  active
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
