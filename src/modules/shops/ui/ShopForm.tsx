"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";
import type { ActionState } from "@/shared/server/action-state";
import { Notice, SubmitButton, TextField } from "@/shared/ui";

export interface ShopValues {
  name: string;
  district: string | null;
  city: string | null;
  phone: string | null;
}

/** Création ou modification d'une boutique (propriétaire, ou admin pour un propriétaire). */
export function ShopForm({
  action,
  hidden = {},
  initial,
  submitLabel,
  successLabel,
  withPhone = true,
}: {
  action: (previous: never, form: FormData) => Promise<ActionState<unknown>>;
  hidden?: Record<string, string>;
  initial?: ShopValues;
  submitLabel: string;
  successLabel: string;
  withPhone?: boolean;
}) {
  const t = useTranslations("shops.fields");
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const [state, formAction] = useActionState(
    action as (previous: ActionState<unknown>, form: FormData) => Promise<ActionState<unknown>>,
    { status: "idle" } as ActionState<unknown>,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const field = (name: string) => {
    const code = state.status === "error" ? state.fields?.[name] : undefined;
    return code ? te(code) : null;
  };

  useEffect(() => {
    if (state.status === "success" && !initial) formRef.current?.reset();
  }, [state, initial]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {state.status === "error" && !state.fields ? <Notice tone="danger">{te(state.error)}</Notice> : null}
      {state.status === "success" ? <Notice tone="positive">{successLabel}</Notice> : null}
      <TextField label={t("name")} name="name" required defaultValue={initial?.name} error={field("name")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={`${t("district")} (${tc("optional")})`} name="district" defaultValue={initial?.district ?? ""} />
        <TextField label={`${t("city")} (${tc("optional")})`} name="city" defaultValue={initial?.city ?? ""} />
      </div>
      {withPhone ? (
        <TextField
          label={`${t("phone")} (${tc("optional")})`}
          name="phone"
          type="tel"
          inputMode="tel"
          leading="+221"
          placeholder={tc("phonePlaceholder")}
          defaultValue={initial?.phone?.replace(/^\+221/, "") ?? ""}
          error={field("phone")}
        />
      ) : null}
      <SubmitButton variant="primary" pendingLabel={tc("saving")}>
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
