"use client";

import { useOffline } from "next/offline";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * Hors ligne si Next.js a détecté un échec réseau (useOffline : couvre le Wi-Fi sans Internet)
 * OU si le navigateur se déclare hors ligne (couvre l'ouverture à froid sans réseau, où
 * useOffline reste à false tant qu'aucune requête n'a échoué).
 */
export function useIsOffline(): boolean {
  const nextOffline = useOffline();
  const browserOffline = useSyncExternalStore(
    subscribe,
    () => !navigator.onLine,
    () => false,
  );
  return nextOffline || browserOffline;
}

/** Bandeau « Hors ligne ». L'indicateur complet de synchronisation arrive au jalon 4. */
export function ConnectivityBanner() {
  const t = useTranslations("connectivity");
  const isOffline = useIsOffline();
  if (!isOffline) return null;
  return (
    <div role="status" className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-encre px-4 py-2 text-sm font-semibold text-white">
      <span aria-hidden="true" className="size-2 rounded-full bg-safran" />
      <span>{t("offline")}</span>
      <span className="hidden font-normal text-white/80 sm:inline">{t("offlineDetail")}</span>
    </div>
  );
}
