import AppShell from "@/components/AppShell";
import type { ReactNode } from "react";

export default function PortalLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
