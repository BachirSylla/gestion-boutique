"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import type { ActionState } from "@/shared/server/action-state";
import { AmountInput, ChoiceGroup, Notice, SubmitButton, TextField } from "@/shared/ui";

type Action = (previous: ActionState, form: FormData) => Promise<ActionState>;

export interface SettingsValues {
  cancelWindowMinutes: number;
  roundingStep: number;
  advanceAlertThreshold: number;
  freeCreditReminderDays: number;
  monthlyDueDay: number | null;
  priceHikePolicy: "immediate" | "after_sellout";
  priceDropPolicy: "immediate" | "after_sellout";
}

function useFormFeedback(state: ActionState) {
  const te = useTranslations("errors");
  return {
    formError: state.status === "error" && !state.fields ? te(state.error) : null,
    field: (name: string) => {
      const code = state.status === "error" ? state.fields?.[name] : undefined;
      return code ? te(code) : null;
    },
  };
}

export function ShopSettingsForm({ action, shopId, values }: { action: Action; shopId: string; values: SettingsValues }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [state, formAction] = useActionState(action, { status: "idle" });
  const { formError, field } = useFormFeedback(state);
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="shopId" value={shopId} />
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      {state.status === "success" ? <Notice tone="positive">{t("saved")}</Notice> : null}
      <div>
        <TextField
          label={t("cancelWindow")}
          name="cancelWindowMinutes"
          inputMode="numeric"
          defaultValue={values.cancelWindowMinutes}
          error={field("cancelWindowMinutes")}
        />
        <p className="mt-1 text-sm text-gris-texte">{t("cancelWindowHint")}</p>
      </div>
      <ChoiceGroup
        legend={t("roundingStep")}
        name="roundingStep"
        type="radio"
        defaultValues={[String(values.roundingStep)]}
        options={[1, 5, 25].map((step) => ({ value: String(step), label: t("roundingStepOption", { step }) }))}
        error={field("roundingStep")}
      />
      <AmountInput label={t("advanceThreshold")} name="advanceAlertThreshold" size="md" defaultValue={values.advanceAlertThreshold} error={field("advanceAlertThreshold")} />
      <TextField
        label={t("freeCreditDays")}
        name="freeCreditReminderDays"
        inputMode="numeric"
        defaultValue={values.freeCreditReminderDays}
        error={field("freeCreditReminderDays")}
      />
      <div>
        <TextField label={t("monthlyDueDay")} name="monthlyDueDay" inputMode="numeric" defaultValue={values.monthlyDueDay ?? ""} error={field("monthlyDueDay")} />
        <p className="mt-1 text-sm text-gris-texte">{t("monthlyDueDayHint")}</p>
      </div>
      {(["priceHikePolicy", "priceDropPolicy"] as const).map((name) => (
        <ChoiceGroup
          key={name}
          legend={t(name)}
          name={name}
          type="radio"
          defaultValues={[values[name]]}
          options={(["after_sellout", "immediate"] as const).map((value) => ({ value, label: t(`policies.${value}`) }))}
        />
      ))}
      <SubmitButton variant="primary" pendingLabel={tc("saving")}>
        {t("save")}
      </SubmitButton>
    </form>
  );
}

export function PaymentMethodsForm({
  action,
  shopId,
  methods,
}: {
  action: Action;
  shopId: string;
  methods: { id: string; label: string; active: boolean }[];
}) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [state, formAction] = useActionState(action, { status: "idle" });
  const { formError } = useFormFeedback(state);
  return (
    <form action={formAction} className="flex flex-col gap-4" key={methods.length}>
      <input type="hidden" name="shopId" value={shopId} />
      {methods.map((m) => (
        <input key={m.id} type="hidden" name="methodIds" value={m.id} />
      ))}
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      {state.status === "success" ? <Notice tone="positive">{tc("saved")}</Notice> : null}
      <ChoiceGroup
        legend={t("paymentMethods")}
        hint={t("paymentMethodsHint")}
        name="activeMethodIds"
        type="checkbox"
        defaultValues={methods.filter((m) => m.active).map((m) => m.id)}
        options={methods.map((m) => ({ value: m.id, label: m.label }))}
      />
      <TextField label={`${t("newMethodLabel")} (${tc("optional")})`} name="newMethodLabel" maxLength={40} autoComplete="off" />
      <SubmitButton variant="secondary" pendingLabel={tc("saving")}>
        {t("saveMethods")}
      </SubmitButton>
    </form>
  );
}
