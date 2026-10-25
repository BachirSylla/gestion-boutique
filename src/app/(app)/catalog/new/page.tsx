import { getTranslations } from "next-intl/server";
import { ProductCreateForm } from "@/modules/catalog";
import { createProductAction } from "@/modules/catalog/server";
import { getShopContext } from "@/modules/customers/server";
import { Card, PageHeader } from "@/shared/ui";
import { NoShop, requireShopPage } from "../../_shell/shop";

export default async function NewProductPage() {
  const { shop } = await requireShopPage("manageCatalog");
  const t = await getTranslations("catalog");
  if (!shop) return <NoShop />;
  const context = await getShopContext(shop);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("new")} back={{ href: "/catalog", label: t("title") }} />
      <Card>
        <ProductCreateForm action={createProductAction} roundingStep={context.settings.roundingStep} />
      </Card>
    </div>
  );
}
