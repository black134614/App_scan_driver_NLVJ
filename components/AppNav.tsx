"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Tài xế" },
  { href: "/dashboard", label: "Dashboard kho" },
  { href: "/ke-hoach", label: "Kế hoạch VT" },
  { href: "/ke-hoach/dashboard", label: "Dashboard KH" },
];

function getActiveHref(pathname: string): string {
  const exact = links.find((l) => l.href === pathname);
  if (exact) return exact.href;

  const nested = links
    .filter(
      (l) => l.href !== "/" && pathname.startsWith(`${l.href}/`)
    )
    .sort((a, b) => b.href.length - a.href.length)[0];

  return nested?.href ?? "";
}

export default function AppNav() {
  const pathname = usePathname();
  const activeHref = getActiveHref(pathname);

  return (
    <nav className="mb-4 -mx-1 overflow-x-auto px-1 pb-1">
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
  );
}
