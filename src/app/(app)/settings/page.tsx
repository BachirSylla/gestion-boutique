import { getTranslations } from "next-intl/server";
import { getShopContext } from "@/modules/customers/server";
import { PaymentMethodsForm, ShopSettingsForm } from "@/modules/shops";
import { savePaymentMethodsAction, saveShopSettingsAction } from "@/modules/shops/server";
import { Card, PageHeader } from "@/shared/ui";
import { NoShop, requireShopPage } from "../_shell/shop";

export default async function SettingsPage() {
  const { shop } = await requireShopPage("manageSettings");
  const t = await getTranslations();
  if (!shop) return <NoShop />;
  const context = await getShopContext(shop);
  const methods = context.paymentMethods.map((m) => ({ id: m.id, active: m.active, label: m.kind === "custom" ? (m.label ?? "") : t(`ledger.methods.${m.kind}`) }));
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("settings.title")} intro={t("settings.intro", { shop: shop.name })} />
      <div className="flex flex-col gap-6">
        <Card>
          <ShopSettingsForm action={saveShopSettingsAction} shopId={shop.id} values={context.settings} />
        </Card>
        <Card>
          <PaymentMethodsForm action={savePaymentMethodsAction} shopId={shop.id} methods={methods} />
        </Card>
      </div>
    </div>
  );
}
