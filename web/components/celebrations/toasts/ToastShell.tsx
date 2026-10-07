"use client";

import type { ReactNode } from "react";

/** Bandeau du haut : surface opaque de l'app, filet teinté par l'événement. */
export function ToastShell({ children, border, overlay }: { children: ReactNode; border: string; overlay?: ReactNode }) {
  return (
    <div
      className="relative flex items-center gap-3 overflow-hidden rounded-2xl px-3.5 py-3"
      style={{ background: "#101011", border: `1px solid ${border}`, boxShadow: "0 12px 36px rgba(0,0,0,0.6)" }}
    >
      {overlay}
      {children}
    </div>
  );
}
