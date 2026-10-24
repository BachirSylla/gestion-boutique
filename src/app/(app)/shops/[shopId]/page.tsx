import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePageAccount } from "@/modules/auth-accounts/server";
import { ShopForm } from "@/modules/shops";
import { updateShopAction } from "@/modules/shops/server";
import { Card, PageHeader } from "@/shared/ui";

export default async function ShopPage({ params }: { params: Promise<{ shopId: string }> }) {
  const account = await requirePageAccount("manageShops");
  const { shopId } = await params;
  const shop = account.shops.find((s) => s.id === shopId);
  if (!shop) notFound();
  const t = await getTranslations();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("shops.edit")} back={{ href: "/shops", label: t("shops.title") }} />
      <Card>
        <ShopForm
          action={updateShopAction}
          hidden={{ shopId: shop.id }}
          initial={{ name: shop.name, district: shop.district, city: shop.city, phone: shop.phone_e164 }}
          submitLabel={t("common.save")}
          successLabel={t("common.saved")}
        />
      </Card>
    </div>
  );
}
