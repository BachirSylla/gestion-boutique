import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePageAccount } from "@/modules/auth-accounts/server";
import { ShopForm } from "@/modules/shops";
import { createShopAction, getCurrentShop } from "@/modules/shops/server";
import { formatPhone } from "@/shared/domain";
import { Badge, Card, PageHeader } from "@/shared/ui";

export default async function ShopsPage() {
  const account = await requirePageAccount("manageShops");
  const t = await getTranslations();
  const current = await getCurrentShop(account);

  return (
    <>
      <PageHeader title={t("shops.title")} intro={t("shops.intro")} />
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div>
          {account.shops.length === 0 ? (
            <Card>
              <p className="text-gris-texte">{t("shops.empty")}</p>
            </Card>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {account.shops.map((shop) => (
                <li key={shop.id}>
                  <Link href={`/shops/${shop.id}`} className="block h-full rounded-carte border border-bordure bg-surface p-5 hover:border-vert-principal">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-lg font-bold text-encre">{shop.name}</p>
                      {shop.id === current?.id ? <Badge tone="positive">{t("shops.current")}</Badge> : null}
                    </div>
                    {shop.district || shop.city ? <p className="text-sm text-gris-texte">{[shop.district, shop.city].filter(Boolean).join(", ")}</p> : null}
                    {shop.phone_e164 ? <p className="montant text-sm text-gris-texte">{formatPhone(shop.phone_e164)}</p> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Card>
          <h2 className="mb-4 text-lg font-bold text-encre">{t("shops.new")}</h2>
          <ShopForm action={createShopAction} submitLabel={t("common.create")} successLabel={t("shops.created")} />
        </Card>
      </div>
    </>
  );
}
