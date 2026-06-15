"use client";

import AppNav from "@/components/AppNav";
import { PortalProvider } from "@/lib/portal-context";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const narrow = pathname === "/";

  return (
    <PortalProvider>
      <main
        className={`mx-auto w-full flex-1 px-4 py-5 sm:px-6 ${
          narrow ? "max-w-md" : "max-w-[1600px]"
        }`}
      >
        <AppNav />
        {children}
      </main>
    </PortalProvider>
  );
}
