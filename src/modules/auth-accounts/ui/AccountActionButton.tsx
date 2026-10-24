"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import type { ActionState } from "@/shared/server/action-state";
import { Notice, SubmitButton } from "@/shared/ui";
import type { IssuedCredentials } from "../domain/credentials-share";
import { CredentialsCard } from "./CredentialsCard";

type Result = { credentials: IssuedCredentials } | null;
type Action = (previous: ActionState<Result>, form: FormData) => Promise<ActionState<Result>>;
/** Accepte toute action dont le résultat est compatible (ActionState<null> ou avec identifiants). */
type AnyAccountAction = (previous: never, form: FormData) => Promise<ActionState<Result>>;

/**
 * Action sensible sur un compte (désactiver, suspendre, réinitialiser) : confirmation,
 * puis affichage du résultat (et des identifiants provisoires le cas échéant).
 */
export function AccountActionButton({
  action,
  fields,
  label,
  confirmText,
  variant = "secondary",
}: {
  action: AnyAccountAction;
  fields: Record<string, string>;
  label: string;
  confirmText: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const [state, formAction] = useActionState(action as Action, { status: "idle" } as ActionState<Result>);

  return (
    <div className="flex flex-col gap-3">
      <form
        action={formAction}
        onSubmit={(event) => {
          if (!window.confirm(confirmText)) event.preventDefault();
        }}
      >
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <SubmitButton variant={variant} block pendingLabel={tc("saving")}>
          {label}
        </SubmitButton>
      </form>
      {state.status === "error" ? <Notice tone="danger">{te(state.error)}</Notice> : null}
      {state.status === "success" && state.data?.credentials ? <CredentialsCard credentials={state.data.credentials} /> : null}
    </div>
  );
}
