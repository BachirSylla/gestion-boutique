import { getTranslations } from "next-intl/server";
import { CustomerList } from "@/modules/customers";
import { listCustomers } from "@/modules/customers/server";
import { PageHeader } from "@/shared/ui";
import { NoShop, requireShopPage } from "../_shell/shop";

/** Versement depuis l'accueil : choisir le client, puis le versement. */
export default async function PickCustomerForPaymentPage() {
  const { shop } = await requireShopPage("recordOperations");
  const t = await getTranslations();
  if (!shop) return <NoShop />;
  const customers = await listCustomers(shop.id);
  return (
    <>
      <PageHeader title={t("ledger.pick.paymentTitle")} back={{ href: "/", label: t("nav.home") }} />
      <CustomerList customers={customers} hrefSuffix="/payment" autoFocus />
    </>
  );
}
