"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { formatAmount } from "@/shared/domain";
import type { ActionState } from "@/shared/server/action-state";
import { AmountInput, ChoiceGroup, Notice, SubmitButton, TextField } from "@/shared/ui";
import { CUSTOMER_TYPES, type CustomerType } from "../domain/customers";

export interface CustomerFormValues {
  id: string;
  fullName: string;
  phone: string | null;
  type: CustomerType;
  creditLimit: number | null;
  alertThreshold: number | null;
  monthlyDueDay: number | null;
  note: string | null;
}

/** Création ou modification de la fiche client. */
export function CustomerForm({
  action,
  initial,
  defaultAlertThreshold,
}: {
  action: (previous: ActionState, form: FormData) => Promise<ActionState>;
  initial?: CustomerFormValues;
  defaultAlertThreshold: number;
}) {
  const t = useTranslations("customers");
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const [state, formAction] = useActionState(action, { status: "idle" });
  const [type, setType] = useState<CustomerType>(initial?.type ?? "free");
  // Identifiant généré sur l'appareil : un double envoi ne crée pas deux clients.
  const [newId] = useState(() => crypto.randomUUID());
  const field = (name: string) => {
    const code = state.status === "error" ? state.fields?.[name] : undefined;
    return code ? te(code) : null;
  };

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {initial ? <input type="hidden" name="customerId" value={initial.id} /> : <input type="hidden" name="newCustomerId" value={newId} />}
      {state.status === "error" && !state.fields ? <Notice tone="danger">{te(state.error)}</Notice> : null}
      <TextField label={t("fields.fullName")} name="fullName" required autoComplete="off" defaultValue={initial?.fullName} error={field("fullName")} />
      <div>
        <TextField
          label={`${t("fields.phone")} (${tc("optional")})`}
          name="phone"
          type="tel"
          inputMode="tel"
          leading="+221"
          placeholder={tc("phonePlaceholder")}
          defaultValue={initial?.phone?.replace(/^\+221/, "") ?? ""}
          error={field("phone")}
        />
        <p className="mt-1 text-sm text-gris-texte">{t("fields.phoneHint")}</p>
      </div>
      <div onChange={(event) => setType((event.target as HTMLInputElement).value as CustomerType)}>
        <ChoiceGroup
          legend={t("fields.type")}
          name="type"
          type="radio"
          defaultValues={[type]}
          options={CUSTOMER_TYPES.map((value) => ({ value, label: t(`types.${value}`), hint: t(`typeHints.${value}`) }))}
          error={field("type")}
        />
      </div>
      <div>
        <AmountInput label={`${t("fields.creditLimit")} (${tc("optional")})`} name="creditLimit" size="md" defaultValue={initial?.creditLimit} error={field("creditLimit")} />
        <p className="mt-1 text-sm text-gris-texte">{t("fields.creditLimitHint")}</p>
      </div>
      {type === "advance" ? (
        <div>
          <AmountInput label={`${t("fields.alertThreshold")} (${tc("optional")})`} name="alertThreshold" size="md" defaultValue={initial?.alertThreshold} error={field("alertThreshold")} />
          <p className="mt-1 text-sm text-gris-texte">{t("fields.alertThresholdHint", { amount: formatAmount(defaultAlertThreshold) })}</p>
        </div>
      ) : null}
      {type === "monthly" ? (
        <div>
          <TextField
            label={`${t("fields.monthlyDueDay")} (${tc("optional")})`}
            name="monthlyDueDay"
            inputMode="numeric"
            defaultValue={initial?.monthlyDueDay ?? ""}
            error={field("monthlyDueDay")}
          />
          <p className="mt-1 text-sm text-gris-texte">{t("fields.monthlyDueDayHint")}</p>
        </div>
      ) : null}
      <TextField label={`${t("fields.note")} (${tc("optional")})`} name="note" defaultValue={initial?.note ?? ""} />
      <SubmitButton variant="primary" block pendingLabel={tc("saving")}>
        {initial ? t("save") : t("create")}
      </SubmitButton>
    </form>
  );
}
