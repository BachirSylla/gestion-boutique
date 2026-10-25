"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useIsOffline } from "@/shared/pwa";
import { syncState } from "../domain/sync";
import { useSyncStatus } from "./SyncProvider";

const DOT: Record<ReturnType<typeof syncState>, string> = {
  synced: "bg-vert-doux",
  pending: "bg-safran",
  offline: "bg-white/60",
  rejected: "bg-brique-doux",
};

/** Indicateur toujours visible : synchronisé / N en attente / hors ligne, et heure de la dernière synchronisation. */
export function SyncIndicator({ tone = "dark", compact = false }: { tone?: "dark" | "light"; compact?: boolean }) {
  const t = useTranslations("sync");
  const format = useFormatter();
  const status = useSyncStatus();
  const offline = useIsOffline();
  const state = syncState({ online: !offline && status.online, pending: status.pending, rejected: status.rejected });
  const label =
    state === "rejected"
      ? t("rejected", { count: status.rejected })
      : state === "offline"
        ? status.pending
          ? t("offlinePending", { count: status.pending })
          : t("offline")
        : state === "pending"
          ? t("pending", { count: status.pending })
          : t("synced");
  const last = status.lastSyncAt ? t("lastSync", { time: format.dateTime(new Date(status.lastSyncAt), { hour: "2-digit", minute: "2-digit" }) }) : null;
  const text = tone === "dark" ? "text-white" : "text-encre";

  return (
    <Link
      href="/sync"
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-2 text-xs font-semibold ${text} hover:bg-black/5 ${compact ? "max-w-36" : ""}`}
      aria-label={last ? `${label} · ${last}` : label}
      data-testid="sync-indicator"
      data-state={state}
    >
      <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${DOT[state]} ${status.syncing ? "animate-pulse" : ""}`} />
      <span className="flex flex-col leading-tight">
        <span>{label}</span>
        {last && !compact ? <span className="font-normal opacity-80">{last}</span> : null}
      </span>
    </Link>
  );
}
