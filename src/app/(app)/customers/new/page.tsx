import { getTranslations } from "next-intl/server";
import { CustomerForm } from "@/modules/customers";
import { getShopContext, saveCustomerAction } from "@/modules/customers/server";
import { Card, PageHeader } from "@/shared/ui";
import { NoShop, requireShopPage } from "../../_shell/shop";

export default async function NewCustomerPage() {
  const { shop } = await requireShopPage("manageCustomers");
  const t = await getTranslations("customers");
  if (!shop) return <NoShop />;
  const context = await getShopContext(shop);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("new")} back={{ href: "/customers", label: t("title") }} />
      <Card>
        <CustomerForm action={saveCustomerAction} defaultAlertThreshold={context.settings.advanceAlertThreshold} />
      </Card>
    </div>
  );
}
