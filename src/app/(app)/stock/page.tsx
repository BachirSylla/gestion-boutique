import { can } from "@/modules/auth-accounts";
import { StockApp } from "@/modules/stock";
import { NoShop, requireShopPage } from "../_shell/shop";

/** Stock : écran lu sur l'appareil (ouvrir, terminer, vendre un sac, réception, inventaire sans réseau). */
export default async function StockPage() {
  const { account, shop } = await requireShopPage("viewCustomers");
  if (!shop) return <NoShop />;
  return (
    <StockApp
      userId={account.userId}
      role={account.role}
      shop={{ id: shop.id, name: shop.name, timezone: shop.timezone }}
      canRecord={can(account.role, "recordOperations")}
    />
  );
}
