import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@/modules/auth-accounts";
import { requirePageAccount, signOutAction } from "@/modules/auth-accounts/server";
import { ShopSwitcher } from "@/modules/shops";
import { getCurrentShop, setCurrentShopAction } from "@/modules/shops/server";
import { SignOutButton, SyncIndicator, SyncProvider } from "@/modules/sync";
import { LogoMark } from "@/shared/ui";
import { countPendingRequests } from "@/modules/customers/server";
import { navigation } from "./_shell/nav";
import { NavLinks } from "./_shell/NavLinks";

/**
 * Coquille de l'application connectée : menu latéral sur ordinateur, barre du bas sur téléphone.
 * Les modules des jalons suivants (clients, stock, bénéfices) ajouteront leurs entrées ici.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const account = await requirePageAccount();
  if (account.mustChangePassword) redirect("/first-password");

  const t = await getTranslations();
  const currentShop = await getCurrentShop(account);
  const pending = currentShop && can(account.role, "decideCancellations") ? await countPendingRequests(currentShop.id) : 0;
  const nav = await navigation(account, pending);
  const roleLabel = account.role ? t(`accounts.roles.${account.role}`) : "";

  const works = can(account.role, "workInShop");
  const shell = (
    <div className="min-h-dvh lg:pl-68">
      {/* Ordinateur : menu latéral */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-68 flex-col gap-6 overflow-y-auto bg-vert-principal px-4 py-6 text-white lg:flex">
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
          <NavLinks items={nav.all} variant="side" label={t("nav.label")} />
        </div>
        {works ? <SyncIndicator /> : null}
        <div className="border-t border-white/15 px-2 pt-4">
          <p className="truncate font-bold">{account.fullName}</p>
          <p className="truncate text-sm text-white/75">{roleLabel}</p>
          <div className="mt-3">
            <SignOutButton action={signOutAction} userId={account.userId} className="min-h-11 justify-start px-0 text-sm text-white hover:bg-white/10" />
          </div>
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
          {works ? <SyncIndicator compact /> : null}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:py-10">{children}</main>
      <NavLinks items={nav.bottom} variant="bottom" label={t("nav.label")} />
    </div>
  );

  // Hors ligne : la file d'envoi et le téléchargement ne concernent que les comptes qui travaillent en boutique.
  return works ? (
    <SyncProvider userId={account.userId} shopIds={account.shops.map((s) => s.id)}>
      {shell}
    </SyncProvider>
  ) : (
    shell
  );
}
