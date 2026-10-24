"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";
import type { ActionState } from "@/shared/server/action-state";
import { Notice, SubmitButton, TextField } from "@/shared/ui";

type Action = (previous: ActionState, form: FormData) => Promise<ActionState>;

/** Changement de mot de passe. `mode="first"` : premier mot de passe, sans le mot de passe actuel. */
export function PasswordForm({ action, mode }: { action: Action; mode: "first" | "change" }) {
  const t = useTranslations("account");
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const [state, formAction] = useActionState(action, { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const fieldError = (name: string) => {
    const code = state.status === "error" ? state.fields?.[name] : undefined;
    return code ? te(code) : null;
  };

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-5">
      {state.status === "error" && !state.fields ? <Notice tone="danger">{te(state.error)}</Notice> : null}
      {state.status === "success" ? <Notice tone="positive">{t("changed")}</Notice> : null}
      {mode === "change" ? (
        <TextField label={t("currentPassword")} name="currentPassword" type="password" autoComplete="current-password" required error={fieldError("currentPassword")} />
      ) : null}
      <TextField
        label={t("newPassword")}
        name="newPassword"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        placeholder={t("newPasswordHint")}
        error={fieldError("newPassword")}
      />
      <TextField label={t("confirmPassword")} name="confirmPassword" type="password" autoComplete="new-password" required error={fieldError("confirmPassword")} />
      <SubmitButton block pendingLabel={tc("saving")}>
        {mode === "first" ? t("first.submit") : t("submit")}
      </SubmitButton>
    </form>
  );
}
