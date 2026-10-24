"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { formatAmount } from "@/shared/domain";
import type { ActionState } from "@/shared/server/action-state";
import { AmountInput, Balance, ChoiceGroup, Notice, SubmitButton, TextField } from "@/shared/ui";
import { balanceAfter } from "../domain/operations";

export interface PaymentMethodOption {
  id: string;
  kind: "cash" | "wave" | "orange_money" | "other" | "custom";
  label: string | null;
}

/** Versement : montant + moyen de paiement (le paiement lui-même se fait hors de l'application). */
export function PaymentForm({
  action,
  customerId,
  balance,
  methods,
}: {
  action: (previous: ActionState, form: FormData) => Promise<ActionState>;
  customerId: string;
  balance: number;
  methods: PaymentMethodOption[];
}) {
  const t = useTranslations("ledger");
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const [state, formAction] = useActionState(action, { status: "idle" });
  const [operationId] = useState(() => crypto.randomUUID());
  const [value, setValue] = useState<number | null>(null);
  const field = (name: string) => {
    const code = state.status === "error" ? state.fields?.[name] : undefined;
    return code ? te(code) : null;
  };
  const amount = value ?? 0;

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        (event.currentTarget.elements.namedItem("deviceCreatedAt") as HTMLInputElement).value = new Date().toISOString();
      }}
      className="flex flex-col gap-5 pb-32"
    >
      <input type="hidden" name="operationId" value={operationId} />
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="deviceCreatedAt" defaultValue="" />
      {state.status === "error" && !state.fields ? <Notice tone="danger">{te(state.error)}</Notice> : null}
      <AmountInput label={t("amount")} name="amount" autoFocus onValueChange={setValue} error={field("amount")} />
      <ChoiceGroup
        legend={t("paymentMethod")}
        name="paymentMethodId"
        type="radio"
        defaultValues={methods[0] ? [methods[0].id] : []}
        options={methods.map((m) => ({ value: m.id, label: m.kind === "custom" ? (m.label ?? "") : t(`methods.${m.kind}`) }))}
        error={field("paymentMethodId")}
      />
      <TextField label={`${t("note")} (${tc("optional")})`} name="note" autoComplete="off" />

      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-bordure bg-surface px-4 py-3 shadow-[0_-4px_16px_rgba(16,35,27,0.08)] lg:bottom-0 lg:left-68">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-gris-texte">{t("newBalance")}</p>
            <Balance value={balanceAfter(balance, "payment", amount)} />
          </div>
          <SubmitButton variant="primary" pendingLabel={t("saving")} disabled={amount <= 0} className="flex-1 py-2 text-lg sm:flex-none sm:px-8">
            <span className="flex flex-col leading-tight">
              <span>{t("savePayment")}</span>
              <span className="montant text-base">{formatAmount(amount)}</span>
            </span>
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
