import { getTranslations } from "next-intl/server";
import { can } from "@/modules/auth-accounts";
import { CustomerList } from "@/modules/customers";
import { listCustomers } from "@/modules/customers/server";
import { LinkButton, PageHeader } from "@/shared/ui";
import { NoShop, requireShopPage } from "../_shell/shop";

export default async function CustomersPage() {
  const { account, shop } = await requireShopPage("viewCustomers");
  const t = await getTranslations("customers");
  if (!shop) return <NoShop />;
  const customers = await listCustomers(shop.id);
  return (
    <>
      <PageHeader title={t("title")} action={can(account.role, "manageCustomers") ? <LinkButton href="/customers/new" variant="secondary">{t("new")}</LinkButton> : null} />
      <CustomerList customers={customers} />
    </>
  );
}
