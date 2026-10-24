import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@/modules/auth-accounts";
import { requirePageAccount, signOutAction } from "@/modules/auth-accounts/server";
import { ShopSwitcher } from "@/modules/shops";
import { getCurrentShop, setCurrentShopAction } from "@/modules/shops/server";
import { Button, LogoMark } from "@/shared/ui";
import { NavLinks, type NavItem } from "./_shell/NavLinks";

/**
 * Coquille de l'application connectée : menu latéral sur ordinateur, barre du bas sur téléphone.
 * Les modules des jalons suivants (clients, stock, bénéfices) ajouteront leurs entrées ici.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const account = await requirePageAccount();
  if (account.mustChangePassword) redirect("/first-password");

  const t = await getTranslations();
  const currentShop = await getCurrentShop(account);
  const items: NavItem[] = [
    { href: "/", label: t("nav.home"), icon: "home" },
    ...(can(account.role, "managePlatform") ? [{ href: "/admin", label: t("nav.admin"), icon: "admin" } as const] : []),
    ...(can(account.role, "manageTeam") ? [{ href: "/team", label: t("nav.team"), icon: "team" } as const] : []),
    ...(can(account.role, "manageShops") ? [{ href: "/shops", label: t("nav.shops"), icon: "shops" } as const] : []),
    { href: "/account", label: t("nav.account"), icon: "account" },
  ];
  const roleLabel = account.role ? t(`accounts.roles.${account.role}`) : "";

  return (
    <div className="min-h-dvh lg:pl-68">
      {/* Ordinateur : menu latéral */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-68 flex-col gap-6 bg-vert-principal px-4 py-6 text-white lg:flex">
        <div className="flex items-center gap-3 px-2">
          <LogoMark size={36} />
          <span className="text-xl font-extrabold">{t("app.name")}</span>
        </div>
        {account.shops.length > 0 ? (
          <div className="px-2">
            <p className="mb-1 text-xs font-semibold tracking-wide text-white/70 uppercase">{t("shell.currentShop")}</p>
            {account.shops.length > 1 ? (
              <ShopSwitcher action={setCurrentShopAction} shops={account.shops} currentShopId={currentShop?.id ?? null} tone="dark" />
            ) : (
              <p className="font-bold">{currentShop?.name}</p>
            )}
          </div>
        ) : null}
        <div className="flex-1">
          <NavLinks items={items} variant="side" label={t("nav.label")} />
        </div>
        <div className="border-t border-white/15 px-2 pt-4">
          <p className="truncate font-bold">{account.fullName}</p>
          <p className="truncate text-sm text-white/75">{roleLabel}</p>
          <form action={signOutAction} className="mt-3">
            <Button type="submit" variant="ghost" className="min-h-11 w-full justify-start px-0 text-sm text-white hover:bg-white/10">
              {t("auth.signOut")}
            </Button>
          </form>
        </div>
      </aside>

      {/* Téléphone et tablette : barre du haut */}
      <header className="sticky top-0 z-30 bg-vert-principal text-white lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <LogoMark size={32} />
          <div className="min-w-0 flex-1">
            {account.shops.length > 1 ? (
              <ShopSwitcher action={setCurrentShopAction} shops={account.shops} currentShopId={currentShop?.id ?? null} tone="dark" />
            ) : (
              <p className="truncate font-bold">{currentShop?.name ?? t("app.name")}</p>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:py-10">{children}</main>
      <NavLinks items={items} variant="bottom" label={t("nav.label")} />
    </div>
  );
}
