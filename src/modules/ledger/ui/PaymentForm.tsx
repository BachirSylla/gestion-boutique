"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { formatAmount } from "@/shared/domain";
import { AmountInput, Balance, Button, ChoiceGroup, TextField } from "@/shared/ui";
import { balanceAfter } from "../domain/operations";

export interface PaymentMethodOption {
  id: string;
  kind: "cash" | "wave" | "orange_money" | "other" | "custom";
  label: string | null;
}

export interface PaymentDraft {
  id: string;
  amount: number;
  paymentMethodId: string;
  note: string | null;
}

/**
 * Versement : montant + moyen de paiement (le paiement lui-même se fait hors de l'application).
 * Écrit sur l'appareil (onSave) : fonctionne sans réseau.
 */
export function PaymentForm({ onSave, balance, methods }: { onSave: (draft: PaymentDraft) => void; balance: number; methods: PaymentMethodOption[] }) {
  const t = useTranslations("ledger");
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const [operationId] = useState(() => crypto.randomUUID());
  const [value, setValue] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<"amountRequired" | "paymentMethodRequired" | null>(null);
  const [saving, setSaving] = useState(false);
  const amount = value ?? 0;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (saving) return;
        const methodId = new FormData(event.currentTarget).get("paymentMethodId");
        if (amount <= 0) return setError("amountRequired");
        if (typeof methodId !== "string" || !methodId) return setError("paymentMethodRequired");
        setSaving(true);
        onSave({ id: operationId, amount, paymentMethodId: methodId, note: note.trim() || null });
      }}
      className="flex flex-col gap-5 pb-32"
    >
      <AmountInput label={t("amount")} name="amount" autoFocus onValueChange={setValue} error={error === "amountRequired" ? te("amountRequired") : null} />
      <ChoiceGroup
        legend={t("paymentMethod")}
        name="paymentMethodId"
        type="radio"
        defaultValues={methods[0] ? [methods[0].id] : []}
        options={methods.map((m) => ({ value: m.id, label: m.kind === "custom" ? (m.label ?? "") : t(`methods.${m.kind}`) }))}
        error={error === "paymentMethodRequired" ? te("paymentMethodRequired") : null}
      />
      <TextField label={`${t("note")} (${tc("optional")})`} value={note} onChange={(event) => setNote(event.target.value)} autoComplete="off" />

      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-bordure bg-surface px-4 py-3 shadow-[0_-4px_16px_rgba(16,35,27,0.08)] lg:bottom-0 lg:left-68">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-gris-texte">{t("newBalance")}</p>
            <Balance value={balanceAfter(balance, "payment", amount)} />
          </div>
          <Button type="submit" variant="primary" disabled={amount <= 0 || saving} className="flex-1 py-2 text-lg sm:flex-none sm:px-8">
            <span className="flex flex-col leading-tight">
              <span>{t("savePayment")}</span>
              <span className="montant text-base">{formatAmount(amount)}</span>
            </span>
          </Button>
        </div>
      </div>
    </form>
  );
}
