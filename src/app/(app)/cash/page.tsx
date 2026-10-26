import { can } from "@/modules/auth-accounts";
import { CashApp } from "@/modules/cash";
import { NoShop, requireShopPage } from "../_shell/shop";

/** Caisse : ventes du jour et clôture du soir, lues et saisies sur l'appareil (sans réseau). */
export default async function CashPage() {
  const { account, shop } = await requireShopPage("viewCustomers");
  if (!shop) return <NoShop />;
  return <CashApp shop={{ id: shop.id, name: shop.name, timezone: shop.timezone }} canRecord={can(account.role, "recordOperations")} />;
}
