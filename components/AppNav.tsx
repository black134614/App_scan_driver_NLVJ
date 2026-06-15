"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePortal } from "@/lib/portal-context";
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
  const exact = links.find((l) => l.href === pathname);
  if (exact) return exact.href;

  const nested = links
    .filter((l) => l.href !== "/" && pathname.startsWith(`${l.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return nested?.href ?? "";
}

export default function AppNav() {
  const pathname = usePathname();
  const { role, carrierName, ready } = usePortal();

  const visibleLinks = ready
    ? ALL_LINKS.filter((l) => l.roles.includes(role))
    : ALL_LINKS;

  const activeHref = getActiveHref(pathname, visibleLinks);

  return (
    <div className="mb-4 min-h-[4.5rem]">
      <div className="mb-2 min-h-[2rem]">
        {carrierName ? (
          <p className="text-lg font-extrabold leading-tight text-red-600 sm:text-xl">
            Nhà vận tải: {carrierName}
          </p>
        ) : ready ? null : (
          <div className="h-7 w-64 max-w-full animate-pulse rounded-lg bg-slate-200" />
        )}
      </div>
      <nav className="-mx-1 overflow-x-auto px-1 pb-1" aria-label="Menu chính">
        <div className="flex min-h-[2.75rem] min-w-max gap-2 rounded-xl bg-slate-100 p-1.5">
          {ready
            ? visibleLinks.map((l) => {
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
              })
            : ALL_LINKS.map((l) => (
                <span
                  key={l.href}
                  className="whitespace-nowrap rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-transparent sm:text-sm"
                  aria-hidden
                >
                  {l.label}
                </span>
              ))}
        </div>
      </nav>
    </div>
  );
}
