import { getTranslations } from "next-intl/server";
import { CustomerList } from "@/modules/customers";
import { listCustomers } from "@/modules/customers/server";
import { LinkButton, PageHeader } from "@/shared/ui";
import { NoShop, requireShopPage } from "../_shell/shop";

/** Saisie rapide depuis l'accueil : choisir le client (recherche dès la première lettre), puis la prise. */
export default async function PickCustomerForTakePage() {
  const { shop } = await requireShopPage("recordOperations");
  const t = await getTranslations();
  if (!shop) return <NoShop />;
  const customers = await listCustomers(shop.id);
  return (
    <>
      <PageHeader
        title={t("ledger.pick.takeTitle")}
        back={{ href: "/", label: t("nav.home") }}
        action={
          <LinkButton href="/customers/new" variant="secondary">
            {t("customers.new")}
          </LinkButton>
        }
      />
      <CustomerList customers={customers} hrefSuffix="/take" autoFocus />
    </>
  );
}
