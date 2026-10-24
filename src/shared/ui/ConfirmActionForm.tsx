"use client";

import { useTranslations } from "next-intl";
import { useActionState, type ReactNode } from "react";
import type { ActionState } from "@/shared/server/action-state";
import { SubmitButton } from "./form";
import { Notice } from "./layout";

type Action = (previous: ActionState<unknown>, form: FormData) => Promise<ActionState<unknown>>;

/** Bouton d'action avec confirmation, champs cachés et affichage du résultat. */
export function ConfirmActionForm({
  action,
  fields,
  label,
  confirmText,
  successText,
  variant = "secondary",
  children,
}: {
  action: (previous: never, form: FormData) => Promise<ActionState<unknown>>;
  fields: Record<string, string>;
  label: string;
  confirmText?: string;
  successText?: string;
  variant?: "primary" | "secondary" | "ghost" | "accent";
  children?: ReactNode;
}) {
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const [state, formAction] = useActionState(action as Action, { status: "idle" } as ActionState<unknown>);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirmText && !window.confirm(confirmText)) event.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <SubmitButton variant={variant} pendingLabel={tc("saving")}>
        {label}
      </SubmitButton>
      {state.status === "error" ? <Notice tone="danger">{te(state.error)}</Notice> : null}
      {state.status === "success" && successText ? <Notice tone="positive">{successText}</Notice> : null}
    </form>
  );
}
