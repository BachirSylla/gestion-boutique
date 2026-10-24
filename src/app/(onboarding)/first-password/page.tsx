import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PasswordForm } from "@/modules/auth-accounts";
import { firstPasswordAction, requirePageAccount, signOutAction } from "@/modules/auth-accounts/server";
import { Button, LogoMark } from "@/shared/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account.first");
  return { title: t("title") };
}

/** Premier mot de passe : obligatoire après la création du compte ou une réinitialisation. */
export default async function FirstPasswordPage() {
  const account = await requirePageAccount();
  if (!account.mustChangePassword) redirect("/");
  const t = await getTranslations();
  return (
    <main className="flex min-h-dvh flex-col md:items-center md:justify-center md:p-8">
      <div className="flex w-full flex-1 flex-col md:max-w-md md:flex-none md:overflow-hidden md:rounded-carte md:border md:border-bordure md:bg-surface md:shadow-sm">
        <header className="bg-vert-principal px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-8 text-white">
          <div className="flex items-center gap-3">
            <LogoMark size={40} />
            <span className="text-2xl font-extrabold">{t("app.name")}</span>
          </div>
        </header>
        <section className="-mt-4 flex-1 rounded-t-[22px] bg-surface px-6 pt-7 pb-8 md:mt-0 md:rounded-none">
          <h1 className="text-2xl font-extrabold text-encre">{t("account.first.title")}</h1>
          <p className="mt-2 mb-6 text-base text-gris-texte">{t("account.first.intro", { name: account.fullName })}</p>
          <PasswordForm action={firstPasswordAction} mode="first" />
          <form action={signOutAction} className="mt-4">
            <Button type="submit" variant="ghost" block>
              {t("auth.signOut")}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}
