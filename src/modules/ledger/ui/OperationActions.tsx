"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button, Notice, TextField } from "@/shared/ui";
import type { CancellationPath } from "../domain/operations";

/**
 * Annuler une opération (direct) ou demander son annulation au propriétaire (motif obligatoire).
 * Écrit sur l'appareil : le serveur tranche à la synchronisation (une annulation arrivée hors délai
 * devient automatiquement une demande, jamais une perte silencieuse).
 */
export function OperationActions({
  path,
  onCancel,
  onRequest,
}: {
  path: CancellationPath;
  onCancel: () => void;
  onRequest: (reason: string) => void;
}) {
  const t = useTranslations("ledger");
  const te = useTranslations("errors");
  const [askReason, setAskReason] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState(false);
  const [sent, setSent] = useState(false);

  // La confirmation passe avant : une fois la demande enregistrée, path devient « none ».
  if (sent) return <Notice tone="positive">{t("requestSent")}</Notice>;
  if (path === "none") return null;

  if (path === "direct") {
    return (
      <Button
        variant="ghost"
        className="mt-2 min-h-11 px-3 text-sm text-brique hover:bg-brique-doux"
        onClick={() => {
          if (window.confirm(t("cancelConfirm"))) onCancel();
        }}
      >
        {t("cancel")}
      </Button>
    );
  }

  return askReason ? (
    <form
      className="mt-2 flex flex-col gap-2 rounded-bouton bg-fond p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (reason.trim().length < 3) return setError(true);
        onRequest(reason.trim());
        setSent(true);
      }}
    >
      <TextField
        label={t("requestReason")}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder={t("requestReasonPlaceholder")}
        error={error ? te("reasonRequired") : null}
      />
      <Button type="submit" variant="secondary">
        {t("sendRequest")}
      </Button>
    </form>
  ) : (
    <Button variant="ghost" onClick={() => setAskReason(true)} className="mt-2 min-h-11 px-3 text-sm">
      {t("requestCancel")}
    </Button>
  );
}

/**
 * Bandeau de confirmation juste après une saisie, avec « Annuler » pendant quelques secondes
 * (CLAUDE.md §8.3). L'annulation suit la même règle que partout (délai serveur, auteur).
 */
export function SavedBanner({ kind, canUndo, onUndo, onClose }: { kind: "take" | "payment"; canUndo: boolean; onUndo: () => void; onClose: () => void }) {
  const t = useTranslations("ledger");
  const [secondsLeft, setSecondsLeft] = useState(10);
  const [undone, setUndone] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return onClose();
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft, onClose]);

  if (undone) return <Notice tone="positive">{t("undone")}</Notice>;
  return (
    <div role="status" className="flex items-center justify-between gap-3 rounded-bouton bg-vert-principal px-4 py-3 text-white">
      <span className="font-semibold">{t(`saved.${kind}`)}</span>
      {canUndo ? (
        <Button
          variant="accent"
          className="min-h-11 px-4 text-sm"
          onClick={() => {
            onUndo();
            setUndone(true);
          }}
        >
          {t("undo")}
          <span className="montant"> ({secondsLeft})</span>
        </Button>
      ) : null}
    </div>
  );
}
