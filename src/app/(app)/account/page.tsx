import { getTranslations } from "next-intl/server";
import { PasswordForm } from "@/modules/auth-accounts";
import { changePasswordAction, requirePageAccount, signOutAction } from "@/modules/auth-accounts/server";
import { SignOutButton } from "@/modules/sync";
import { Card, PageHeader } from "@/shared/ui";

export default async function AccountPage() {
  const account = await requirePageAccount();
  const t = await getTranslations();
  const roleLabel = account.role ? t(`accounts.roles.${account.role}`) : "";
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("account.title")} />
      <div className="flex flex-col gap-6">
        <Card>
          <h2 className="text-lg font-bold text-encre">{t("account.identity")}</h2>
          <p className="mt-2 text-base font-semibold text-encre">{account.fullName}</p>
          <p className="text-gris-texte">
            {roleLabel}
            {account.tenantName ? <span> · {account.tenantName}</span> : null}
          </p>
        </Card>
        <Card>
          <h2 className="mb-4 text-lg font-bold text-encre">{t("account.changePassword")}</h2>
          <PasswordForm action={changePasswordAction} mode="change" />
        </Card>
      <div>
        <SignOutButton action={signOutAction} userId={account.userId} />
      </div>
      </div>
    </div>
  );
}
