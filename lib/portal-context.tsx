"use client";

import type { PortalRole } from "@/lib/types";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface PortalState {
  role: PortalRole;
  carrierName: string | null;
  ready: boolean;
}

const PortalContext = createContext<PortalState>({
  role: "anonymous",
  carrierName: null,
  ready: false,
});

export function PortalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PortalState>({
    role: "anonymous",
    carrierName: null,
    ready: false,
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setState({
          role: d.role ?? "anonymous",
          carrierName: d.carrierName ?? null,
          ready: true,
        });
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, ready: true }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => state, [state.role, state.carrierName, state.ready]);

  return (
    <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
  );
}

export function usePortal() {
  return useContext(PortalContext);
}
