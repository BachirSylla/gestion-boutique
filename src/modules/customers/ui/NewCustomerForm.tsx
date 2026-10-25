"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useSync } from "@/modules/sync";
import { formatAmount } from "@/shared/domain";
import { AmountInput, Button, ChoiceGroup, TextField } from "@/shared/ui";
import { CUSTOMER_TYPES, parseCustomerInput, type CustomerFieldError, type CustomerInput, type CustomerType } from "../domain/customers";

/** Nouveau client, créé sur l'appareil (identifiant local) : possible sans réseau, envoyé à la synchronisation. */
export function NewCustomerForm({ shopId, defaultAlertThreshold, onCreated }: { shopId: string; defaultAlertThreshold: number; onCreated: (id: string) => void }) {
  const t = useTranslations("customers");
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const { engine } = useSync();
  const [id] = useState(() => crypto.randomUUID());
  const [type, setType] = useState<CustomerType>("free");
  const [fields, setFields] = useState<Partial<Record<keyof CustomerInput, CustomerFieldError>>>({});
  const field = (name: keyof CustomerInput) => (fields[name] ? te(fields[name]!) : null);

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        const raw = Object.fromEntries([...new FormData(event.currentTarget).entries()].map(([k, v]) => [k, String(v)]));
        const parsed = parseCustomerInput(raw);
        if (!parsed.ok) return setFields(parsed.fields);
        void engine.enqueue({ type: "customer.create", customer: { id, shopId, ...parsed.value } }, id);
        onCreated(id);
      }}
    >
      <TextField label={t("fields.fullName")} name="fullName" required autoComplete="off" error={field("fullName")} />
      <div>
        <TextField label={`${t("fields.phone")} (${tc("optional")})`} name="phone" type="tel" inputMode="tel" leading="+221" placeholder={tc("phonePlaceholder")} error={field("phone")} />
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
        <AmountInput label={`${t("fields.creditLimit")} (${tc("optional")})`} name="creditLimit" size="md" error={field("creditLimit")} />
        <p className="mt-1 text-sm text-gris-texte">{t("fields.creditLimitHint")}</p>
      </div>
      {type === "advance" ? (
        <div>
          <AmountInput label={`${t("fields.alertThreshold")} (${tc("optional")})`} name="alertThreshold" size="md" error={field("alertThreshold")} />
          <p className="mt-1 text-sm text-gris-texte">{t("fields.alertThresholdHint", { amount: formatAmount(defaultAlertThreshold) })}</p>
        </div>
      ) : null}
      {type === "monthly" ? (
        <div>
          <TextField label={`${t("fields.monthlyDueDay")} (${tc("optional")})`} name="monthlyDueDay" inputMode="numeric" error={field("monthlyDueDay")} />
          <p className="mt-1 text-sm text-gris-texte">{t("fields.monthlyDueDayHint")}</p>
        </div>
      ) : null}
      <TextField label={`${t("fields.note")} (${tc("optional")})`} name="note" />
      <Button type="submit" variant="primary" block>
        {t("create")}
      </Button>
    </form>
  );
}
