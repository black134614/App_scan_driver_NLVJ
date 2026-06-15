import type { ReactNode } from "react";
import { cardCls } from "@/lib/ui";

export default function Card({
  children,
  className = "",
  padding = true,
}: {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <section className={`${cardCls} ${padding ? "p-4" : ""} ${className}`}>
      {children}
    </section>
  );
}
