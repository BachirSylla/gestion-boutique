"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { CredentialsCard, type IssuedCredentials } from "@/modules/auth-accounts";
import type { ActionState } from "@/shared/server/action-state";
import { FormSection, Notice, SubmitButton, TextField } from "@/shared/ui";

type Result = { tenantId: string; credentials: IssuedCredentials };

/** Création d'un propriétaire, de son compte et de sa première boutique par l'admin plateforme. */
export function CreateOwnerForm({ action }: { action: (previous: ActionState<Result>, form: FormData) => Promise<ActionState<Result>> }) {
  const t = useTranslations("admin.create");
  const ts = useTranslations("shops.fields");
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const [state, formAction] = useActionState(action, { status: "idle" });
  const field = (name: string) => {
    const code = state.status === "error" ? state.fields?.[name] : undefined;
    return code ? te(code) : null;
  };

  if (state.status === "success") {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="positive">{t("done")}</Notice>
        <CredentialsCard credentials={state.data.credentials} />
        <Link href={`/admin/${state.data.tenantId}`} className="text-center font-semibold text-vert-fonce underline">
          {t("openDetail")}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-8">
      {state.status === "error" && !state.fields ? <Notice tone="danger">{te(state.error)}</Notice> : null}
      <FormSection title={t("ownerSection")}>
        <TextField label={t("ownerName")} name="ownerName" autoComplete="off" required error={field("ownerName")} />
        <TextField
          label={t("ownerPhone")}
          name="ownerPhone"
          type="tel"
          inputMode="tel"
          leading="+221"
          placeholder={tc("phonePlaceholder")}
          required
          error={field("ownerPhone")}
        />
        <TextField label={`${t("tenantName")} (${tc("optional")})`} name="tenantName" placeholder={t("tenantNameHint")} />
      </FormSection>
      <FormSection title={t("shopSection")} hint={t("shopSectionHint")}>
        <TextField label={ts("name")} name="shopName" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={ts("district")} name="shopDistrict" />
          <TextField label={ts("city")} name="shopCity" />
        </div>
      </FormSection>
      <SubmitButton variant="primary" block pendingLabel={tc("creating")}>
        {t("submit")}
      </SubmitButton>
    </form>
  );
}
