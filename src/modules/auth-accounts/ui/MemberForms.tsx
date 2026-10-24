"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import type { ActionState } from "@/shared/server/action-state";
import { Button, ChoiceGroup, Notice, SubmitButton, TextField } from "@/shared/ui";
import type { IssuedCredentials } from "../domain/credentials-share";
import { MEMBER_ROLES } from "../domain/permissions";
import { CredentialsCard } from "./CredentialsCard";

export interface ShopOption {
  id: string;
  name: string;
  place: string | null;
}

type CreateResult = { userId: string; credentials: IssuedCredentials };
type CreateAction = (previous: ActionState<CreateResult>, form: FormData) => Promise<ActionState<CreateResult>>;

function useFieldErrors<T>(state: ActionState<T>) {
  const te = useTranslations("errors");
  return {
    // Erreur générale seulement si aucun champ n'est en cause (sinon elle s'affiche sous le champ).
    formError: state.status === "error" && !state.fields ? te(state.error) : null,
    field: (name: string) => {
      const code = state.status === "error" ? state.fields?.[name] : undefined;
      return code ? te(code) : null;
    },
  };
}

/** Création d'un gérant ou d'un comptable par le propriétaire. */
export function CreateMemberForm(props: { action: CreateAction; shops: ShopOption[] }) {
  // « Ajouter un autre employé » remonte le formulaire (nouvel état d'action, champs vides).
  const [round, setRound] = useState(0);
  return <CreateMemberFormRound key={round} {...props} onAnother={() => setRound((r) => r + 1)} />;
}

function CreateMemberFormRound({ action, shops, onAnother }: { action: CreateAction; shops: ShopOption[]; onAnother: () => void }) {
  const t = useTranslations("team.create");
  const tr = useTranslations("accounts");
  const tc = useTranslations("common");
  const [state, formAction] = useActionState(action, { status: "idle" });
  const { formError, field } = useFieldErrors(state);

  if (state.status === "success") {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="positive">{t("done")}</Notice>
        <CredentialsCard credentials={state.data.credentials} />
        <Button variant="ghost" onClick={onAnother}>
          {t("another")}
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      <TextField label={t("fullName")} name="fullName" autoComplete="off" required error={field("fullName")} />
      <TextField label={t("phone")} name="phone" type="tel" inputMode="tel" leading="+221" placeholder={tc("phonePlaceholder")} required error={field("phone")} />
      <ChoiceGroup
        legend={t("role")}
        name="role"
        type="radio"
        defaultValues={["manager"]}
        options={MEMBER_ROLES.map((role) => ({ value: role, label: tr(`roles.${role}`), hint: tr(`roleHints.${role}`) }))}
        error={field("role")}
      />
      <ChoiceGroup
        legend={t("shops")}
        hint={t("shopsHint")}
        name="shopIds"
        type="checkbox"
        defaultValues={shops.length === 1 ? [shops[0]!.id] : []}
        options={shops.map((s) => ({ value: s.id, label: s.name, hint: s.place ?? undefined }))}
        error={field("shopIds")}
      />
      <SubmitButton variant="primary" block pendingLabel={tc("creating")}>
        {t("submit")}
      </SubmitButton>
    </form>
  );
}

/** Boutiques rattachées à un employé. */
export function MemberShopsForm({
  action,
  userId,
  shops,
  selected,
}: {
  action: (previous: ActionState, form: FormData) => Promise<ActionState>;
  userId: string;
  shops: ShopOption[];
  selected: string[];
}) {
  const t = useTranslations("team.detail");
  const tc = useTranslations("common");
  const [state, formAction] = useActionState(action, { status: "idle" });
  const { formError, field } = useFieldErrors(state);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="userId" value={userId} />
      <ChoiceGroup
        legend={t("shops")}
        name="shopIds"
        type="checkbox"
        defaultValues={selected}
        options={shops.map((s) => ({ value: s.id, label: s.name, hint: s.place ?? undefined }))}
        error={field("shopIds")}
      />
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      {state.status === "success" ? <Notice tone="positive">{t("shopsSaved")}</Notice> : null}
      <SubmitButton variant="secondary" pendingLabel={tc("saving")}>
        {t("saveShops")}
      </SubmitButton>
    </form>
  );
}
