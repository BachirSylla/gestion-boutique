import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentAccount, signOutAction } from "@/modules/auth-accounts/server";
import { Button, LogoMark } from "@/shared/ui";

export default async function HomePage() {
  const account = await getCurrentAccount();
  if (!account) redirect("/login");
  if (!account.access.allowed) redirect(`/auth/denied?reason=${account.access.reason}`);

  const t = await getTranslations();
  const roleLabel = account.role ? t(`accounts.roles.${account.role}`) : "";

  return (
    <div className="min-h-dvh">
      <header className="bg-vert-principal text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <LogoMark size={36} />
            <span className="text-xl font-extrabold">{t("app.name")}</span>
          </div>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" className="min-h-11 px-3 text-sm text-white hover:bg-white/10">
              {t("auth.signOut")}
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-10">
        <h1 className="text-2xl font-extrabold text-encre sm:text-3xl">{t("home.greeting", { name: account.fullName })}</h1>
        <p className="mt-1 text-base text-gris-texte">
          {roleLabel}
          {account.tenantName ? <span> · {account.tenantName}</span> : null}
        </p>

        {account.role === "platformAdmin" ? (
          <section className="mt-6 rounded-carte border border-bordure bg-surface p-5">
            <p className="text-base text-encre">{t("home.adminIntro")}</p>
          </section>
        ) : (
          <section className="mt-6 rounded-carte border border-bordure bg-surface p-5">
            <h2 className="text-lg font-bold text-encre">{t("home.yourShops", { count: account.shops.length })}</h2>
            {account.shops.length === 0 ? (
              <p className="mt-2 text-gris-texte">{t("home.noShop")}</p>
            ) : (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {account.shops.map((shop) => (
                  <li key={shop.id} className="rounded-bouton bg-vert-doux px-4 py-3">
                    <p className="font-bold text-vert-fonce">{shop.name}</p>
                    {shop.district || shop.city ? (
                      <p className="text-sm text-gris-texte">{[shop.district, shop.city].filter(Boolean).join(", ")}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <p className="mt-6 rounded-carte bg-safran-doux px-5 py-4 text-sm text-encre">{t("home.comingSoon")}</p>
      </main>
    </div>
  );
}
