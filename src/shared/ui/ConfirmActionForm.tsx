"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef, type ReactNode } from "react";
import type { ActionState } from "@/shared/server/action-state";
import { useConfirm } from "./ConfirmDialog";
import { SubmitButton } from "./form";
import { Notice } from "./layout";

type Action = (previous: ActionState<unknown>, form: FormData) => Promise<ActionState<unknown>>;

/** Bouton d'action avec confirmation, champs cachés et affichage du résultat. */
export function ConfirmActionForm({
  action,
  fields,
  label,
  confirmText,
  confirmTone,
  successText,
  variant = "secondary",
  children,
}: {
  action: (previous: never, form: FormData) => Promise<ActionState<unknown>>;
  fields: Record<string, string>;
  label: string;
  confirmText?: string;
  /** Par défaut « danger » pour un bouton discret (ghost), sinon « primary ». */
  confirmTone?: "primary" | "danger";
  successText?: string;
  variant?: "primary" | "secondary" | "ghost" | "accent";
  children?: ReactNode;
}) {
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const [state, formAction] = useActionState(action as Action, { status: "idle" } as ActionState<unknown>);
  const confirm = useConfirm();
  const confirmed = useRef(false);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!confirmText || confirmed.current) {
          confirmed.current = false;
          return;
        }
        event.preventDefault();
        const form = event.currentTarget;
        void confirm({ message: confirmText, confirmLabel: label, tone: confirmTone ?? (variant === "ghost" ? "danger" : "primary") }).then((ok) => {
          if (!ok) return;
          confirmed.current = true;
          form.requestSubmit();
        });
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
