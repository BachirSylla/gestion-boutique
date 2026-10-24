"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import type { ActionState } from "@/shared/server/action-state";
import { Button, Notice, SubmitButton, TextField } from "@/shared/ui";
import type { CancellationPath } from "../domain/operations";

type Action = (previous: ActionState, form: FormData) => Promise<ActionState>;

function deviceNow(event: React.FormEvent<HTMLFormElement>) {
  (event.currentTarget.elements.namedItem("deviceCreatedAt") as HTMLInputElement).value = new Date().toISOString();
}

/** Annuler une opération (direct) ou demander son annulation au propriétaire (motif obligatoire). */
export function OperationActions({
  path,
  operationId,
  customerId,
  cancelAction,
  requestAction,
}: {
  path: CancellationPath;
  operationId: string;
  customerId: string;
  cancelAction: Action;
  requestAction: Action;
}) {
  const t = useTranslations("ledger");
  const te = useTranslations("errors");
  const [cancelState, cancelFormAction] = useActionState(cancelAction, { status: "idle" });
  const [requestState, requestFormAction] = useActionState(requestAction, { status: "idle" });
  const [cancellationId] = useState(() => crypto.randomUUID());
  const [requestId] = useState(() => crypto.randomUUID());
  // Le serveur peut refuser l'annulation directe (délai dépassé entre-temps) : on propose la demande.
  const needsRequest = path === "request" || (cancelState.status === "error" && cancelState.error === "cancelNeedsRequest");
  const [askReason, setAskReason] = useState(false);

  // La confirmation passe avant : après l'envoi, la page recalcule path à « none » (demande en attente).
  if (requestState.status === "success") return <Notice tone="positive">{t("requestSent")}</Notice>;
  if (path === "none") return null;

  return (
    <div className="mt-2 flex flex-col gap-2">
      {!needsRequest ? (
        <form
          action={cancelFormAction}
          onSubmit={(event) => {
            if (!window.confirm(t("cancelConfirm"))) event.preventDefault();
            else deviceNow(event);
          }}
        >
          <input type="hidden" name="cancellationId" value={cancellationId} />
          <input type="hidden" name="operationId" value={operationId} />
          <input type="hidden" name="customerId" value={customerId} />
          <input type="hidden" name="deviceCreatedAt" defaultValue="" />
          <SubmitButton variant="ghost" className="min-h-11 px-3 text-sm text-brique hover:bg-brique-doux">
            {t("cancel")}
          </SubmitButton>
        </form>
      ) : askReason ? (
        <form action={requestFormAction} onSubmit={deviceNow} className="flex flex-col gap-2 rounded-bouton bg-fond p-3">
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="operationId" value={operationId} />
          <input type="hidden" name="customerId" value={customerId} />
          <input type="hidden" name="deviceCreatedAt" defaultValue="" />
          <TextField
            label={t("requestReason")}
            name="reason"
            required
            minLength={3}
            placeholder={t("requestReasonPlaceholder")}
            error={requestState.status === "error" ? te(requestState.error) : null}
          />
          <SubmitButton variant="secondary">{t("sendRequest")}</SubmitButton>
        </form>
      ) : (
        <Button variant="ghost" onClick={() => setAskReason(true)} className="min-h-11 self-start px-3 text-sm">
          {t("requestCancel")}
        </Button>
      )}
      {cancelState.status === "error" && cancelState.error !== "cancelNeedsRequest" ? <Notice tone="danger">{te(cancelState.error)}</Notice> : null}
      {cancelState.status === "error" && cancelState.error === "cancelNeedsRequest" && !askReason ? <Notice>{te("cancelNeedsRequest")}</Notice> : null}
    </div>
  );
}

/**
 * Bandeau de confirmation juste après une saisie, avec « Annuler » pendant quelques secondes
 * (CLAUDE.md §8.3). L'annulation passe par la même règle que partout (délai, auteur).
 */
export function SavedBanner({
  kind,
  operationId,
  customerId,
  canUndo,
  cancelAction,
}: {
  kind: "take" | "payment";
  operationId: string;
  customerId: string;
  canUndo: boolean;
  cancelAction: Action;
}) {
  const t = useTranslations("ledger");
  const router = useRouter();
  const pathname = usePathname();
  const [state, formAction] = useActionState(cancelAction, { status: "idle" });
  const [cancellationId] = useState(() => crypto.randomUUID());
  const [secondsLeft, setSecondsLeft] = useState(10);

  useEffect(() => {
    if (secondsLeft <= 0) {
      router.replace(pathname, { scroll: false });
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft, router, pathname]);

  if (state.status === "success") return <Notice tone="positive">{t("undone")}</Notice>;

  return (
    <div role="status" className="flex items-center justify-between gap-3 rounded-bouton bg-vert-principal px-4 py-3 text-white">
      <span className="font-semibold">{t(`saved.${kind}`)}</span>
      {canUndo ? (
        <form action={formAction} onSubmit={deviceNow}>
          <input type="hidden" name="cancellationId" value={cancellationId} />
          <input type="hidden" name="operationId" value={operationId} />
          <input type="hidden" name="customerId" value={customerId} />
          <input type="hidden" name="deviceCreatedAt" defaultValue="" />
          <SubmitButton variant="accent" className="min-h-11 px-4 text-sm">
            {t("undo")}
            <span className="montant"> ({secondsLeft})</span>
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
