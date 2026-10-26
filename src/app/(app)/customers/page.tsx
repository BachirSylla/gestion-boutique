import { can } from "@/modules/auth-accounts";
import { CustomersApp } from "@/modules/customers";
import { NoShop, requireShopPage } from "../_shell/shop";

/**
 * Clients, fiches, prises et versements : écran lu sur l'appareil (fonctionne sans réseau).
 * Le serveur ne fournit que l'identité et la boutique ; les données viennent de la base locale.
 */
export default async function CustomersPage() {
  const { account, shop } = await requireShopPage("viewCustomers");
  if (!shop) return <NoShop />;
  return (
    <CustomersApp
      userId={account.userId}
      role={account.role}
      shop={{ id: shop.id, name: shop.name, timezone: shop.timezone, district: shop.district, city: shop.city, phone: shop.phone_e164 }}
      canRecord={can(account.role, "recordOperations")}
      canManage={can(account.role, "manageCustomers")}
    />
  );
}
