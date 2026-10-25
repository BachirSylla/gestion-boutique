"use client";

import { useTranslations } from "next-intl";
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { getBrowserSupabase } from "@/shared/supabase/browser";
import { SyncEngine, type SyncStatus } from "../data/engine";
import { LocalDatabase, localDatabaseName } from "../data/local-db";
import { SupabaseTransport } from "../data/supabase-transport";

const SYNC_INTERVAL_MS = 60_000;
const engines = new Map<string, SyncEngine>();

interface SyncContextValue {
  engine: SyncEngine;
  /** Motif traduit d'une annulation hors ligne arrivée hors délai (devenue demande). */
  lateCancellationReason: string;
}

const SyncContext = createContext<SyncContextValue | null>(null);

function engineFor(userId: string, shopIds: string[]): SyncEngine {
  const key = `${userId}:${shopIds.join(",")}`;
  let engine = engines.get(key);
  if (!engine) {
    const db = new LocalDatabase(localDatabaseName(userId));
    engine = new SyncEngine(db, new SupabaseTransport(getBrowserSupabase()), { userId, shopIds, isOnline: () => navigator.onLine, autoRetry: true });
    engines.set(key, engine);
  }
  return engine;
}

/** Démarre la synchronisation de l'utilisateur connecté (envoi de la file, téléchargement de ses boutiques). */
export function SyncProvider({ userId, shopIds, children }: { userId: string; shopIds: string[]; children: ReactNode }) {
  const t = useTranslations("sync");
  const [engine] = useState(() => (typeof window === "undefined" ? null : engineFor(userId, shopIds)));

  useEffect(() => {
    if (!engine) return;
    void engine.forgetOtherShops().then(() => engine.refreshCounts());
    void engine.sync();
    // Les écrans hors ligne doivent pouvoir s'ouvrir à froid : on les met en cache dès maintenant.
    window.serwist?.messageSW({ type: "CACHE_URLS", payload: { urlsToCache: ["/", "/customers"] } });
    const syncNow = () => void engine.sync();
    const onOffline = () => void engine.refreshCounts();
    const onVisible = () => document.visibilityState === "visible" && syncNow();
    window.addEventListener("online", syncNow);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(syncNow, SYNC_INTERVAL_MS);
    return () => {
      window.removeEventListener("online", syncNow);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [engine]);

  if (!engine) return <>{children}</>;
  return <SyncContext.Provider value={{ engine, lateCancellationReason: t("lateCancellationReason") }}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const value = useContext(SyncContext);
  if (!value) throw new Error("useSync doit être utilisé sous <SyncProvider>");
  return value;
}

/** Version tolérante (rendu serveur ou hors fournisseur) : null si indisponible. */
export function useOptionalSync(): SyncContextValue | null {
  return useContext(SyncContext);
}

const OFFLINE_STATUS: SyncStatus = { online: true, syncing: false, pending: 0, rejected: 0, lastSyncAt: null };

export function useSyncStatus(): SyncStatus {
  const sync = useOptionalSync();
  return useSyncExternalStore(
    sync?.engine.subscribe ?? (() => () => {}),
    sync?.engine.getStatus ?? (() => OFFLINE_STATUS),
    () => OFFLINE_STATUS,
  );
}

/** Efface les données de l'appareil (base locale, pages en cache) : à la déconnexion, sur un appareil partagé. */
export async function clearLocalData(userId: string): Promise<void> {
  for (const [key, engine] of engines) {
    if (key.startsWith(`${userId}:`)) {
      engine.db.close();
      engines.delete(key);
    }
  }
  await new LocalDatabase(localDatabaseName(userId)).delete();
  if ("caches" in window) {
    for (const name of await caches.keys()) {
      if (name.startsWith("pages")) await caches.delete(name);
    }
  }
}
