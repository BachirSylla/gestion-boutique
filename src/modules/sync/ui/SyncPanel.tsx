"use client";

import { useFormatter, useTranslations } from "next-intl";
import { formatAmount } from "@/shared/domain";
import { useIsOffline } from "@/shared/pwa";
import { Badge, Button, Card, Notice } from "@/shared/ui";
import { rejectionMessage, syncState, type OutboxEntry } from "../domain/sync";
import { useRejectedEntries } from "./hooks";
import { useOptionalSync, useSyncStatus } from "./SyncProvider";

/** Page Synchronisation : état détaillé, envoi manuel, saisies refusées (à lire puis retirer). */
export function SyncPanel() {
  const t = useTranslations();
  const format = useFormatter();
  const engine = useOptionalSync()?.engine;
  const status = useSyncStatus();
  const offline = useIsOffline();
  const rejected = useRejectedEntries();
  const state = syncState({ online: !offline && status.online, pending: status.pending, rejected: status.rejected });
  const describe = (entry: OutboxEntry): string => {
    const c = entry.command;
    switch (c.type) {
      case "take":
        return `${t("ledger.kinds.take")} · ${formatAmount(c.amount)}`;
      case "payment":
        return `${t("ledger.kinds.payment")} · ${formatAmount(c.amount)}`;
      case "cancel":
        return t("ledger.kinds.cancellation");
      case "request":
        return t("ledger.requestCancel");
      case "customer.create":
        return `${t("customers.new")} · ${c.customer.fullName}`;
      default:
        return t(`stock.kinds.${c.type.replace("stock.", "") as "open"}`);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <p className="text-lg font-bold text-encre" data-testid="sync-state">
          {t(`sync.states.${state}`)}
        </p>
        <ul className="mt-2 space-y-1 text-gris-texte">
          <li>{t("sync.pending", { count: status.pending })}</li>
          <li>{status.lastSyncAt ? t("sync.lastSyncFull", { date: format.dateTime(new Date(status.lastSyncAt), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) }) : t("sync.neverSynced")}</li>
        </ul>
        <p className="mt-3 text-sm text-gris-texte">{t("sync.explanation")}</p>
        <div className="mt-4">
          <Button variant="primary" disabled={offline || status.syncing} onClick={() => void engine?.sync()}>
            {status.syncing ? t("sync.syncing") : t("sync.syncNow")}
          </Button>
        </div>
      </Card>

      {rejected.length ? (
        <Card>
          <h2 className="text-lg font-bold text-encre">{t("sync.rejectedTitle")}</h2>
          <p className="mt-1 text-sm text-gris-texte">{t("sync.rejectedIntro")}</p>
          <ul className="mt-3 flex flex-col divide-y divide-bordure">
            {rejected.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-encre">{describe(entry)}</p>
                  <p className="text-sm text-gris-texte">{format.dateTime(new Date(entry.deviceCreatedAt), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                  <Badge tone="danger">{t(`errors.${rejectionMessage(entry.error)}`)}</Badge>
                </div>
                <Button variant="ghost" onClick={() => void engine?.dismissRejected(entry.id)}>
                  {t("sync.dismiss")}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Notice tone="positive">{t("sync.noRejected")}</Notice>
      )}
    </div>
  );
}

