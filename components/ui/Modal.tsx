"use client";

import { useEffect, type ReactNode } from "react";

export default function Modal({
  open,
  onClose,
  children,
  className = "",
  maxWidth = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-5 shadow-xl ${maxWidth} ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
