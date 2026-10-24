import { getTranslations } from "next-intl/server";
import { can } from "@/modules/auth-accounts";
import type { CurrentAccount } from "@/modules/auth-accounts/server";
import type { NavItem } from "./NavLinks";

/**
 * Entrées de navigation selon le rôle. `bottom` : barre du bas sur téléphone (4 entrées au plus,
 * la dernière ouvre le menu) ; `all` : menu latéral sur ordinateur et page Menu.
 * Les modules des jalons suivants (stock, bénéfices) s'ajouteront ici.
 */
export async function navigation(account: Pick<CurrentAccount, "role">, pendingCancellations: number): Promise<{ bottom: NavItem[]; all: NavItem[] }> {
  const t = await getTranslations("nav");
  const role = account.role;
  const item = (href: string, icon: NavItem["icon"], label: string, badge?: number): NavItem => ({ href, icon, label, badge });

  if (can(role, "managePlatform")) {
    const all = [item("/", "home", t("home")), item("/admin", "admin", t("admin")), item("/account", "account", t("account"))];
    return { bottom: all, all };
  }

  const all: NavItem[] = [
    item("/", "home", t("home")),
    ...(can(role, "viewCustomers") ? [item("/customers", "customers", t("customers")), item("/reminders", "reminders", t("reminders"))] : []),
    ...(can(role, "decideCancellations") ? [item("/cancellations", "cancellations", t("cancellations"), pendingCancellations)] : []),
    ...(can(role, "manageTeam") ? [item("/team", "team", t("team"))] : []),
    ...(can(role, "manageShops") ? [item("/shops", "shops", t("shops"))] : []),
    ...(can(role, "manageSettings") ? [item("/settings", "settings", t("settings"))] : []),
    item("/account", "account", t("account")),
  ];
  const bottom: NavItem[] = [
    item("/", "home", t("home")),
    ...(can(role, "viewCustomers") ? [item("/customers", "customers", t("customers")), item("/reminders", "reminders", t("reminders"))] : []),
    item("/menu", "menu", t("menu"), pendingCancellations),
  ];
  return { bottom, all };
}
