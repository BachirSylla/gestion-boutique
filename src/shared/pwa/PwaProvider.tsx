"use client";

import { SerwistProvider } from "@serwist/turbopack/react";
import type { ReactNode } from "react";

/** Enregistre le service worker (désactivé en développement pour ne pas masquer les changements). */
export function PwaProvider({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV === "development"} reloadOnOnline={false}>
      {children}
    </SerwistProvider>
  );
}
