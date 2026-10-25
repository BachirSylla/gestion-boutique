import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { addStarterCatalogAction, listProducts } from "@/modules/catalog/server";
import { formatAmount, formatQuantity } from "@/shared/domain";
import { Badge, Card, ConfirmActionForm, LinkButton, PageHeader } from "@/shared/ui";
import { NoShop, requireShopPage } from "../_shell/shop";

export default async function CatalogPage() {
  const { shop } = await requireShopPage("manageCatalog");
  const t = await getTranslations("catalog");
  if (!shop) return <NoShop />;
  const products = await listProducts(shop.id);
  return (
    <>
      <PageHeader title={t("title")} intro={t("intro", { shop: shop.name })} action={<LinkButton href="/catalog/new" variant="secondary">{t("new")}</LinkButton>} />
      {products.length === 0 ? (
        <Card>
          <p className="text-encre">{t("empty")}</p>
          <p className="mt-1 text-sm text-gris-texte">{t("starterHint")}</p>
          <div className="mt-4">
            <ConfirmActionForm action={addStarterCatalogAction} fields={{}} label={t("addStarter")} variant="primary" />
          </div>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {products.map((product) => (
            <li key={product.id}>
              <Link href={`/catalog/${product.id}`} className="block h-full rounded-carte border border-bordure bg-surface p-5 hover:border-vert-principal">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-lg font-bold text-encre">{product.name}</p>
                  {product.pending ? <Badge tone="warning">{t("pendingBadge")}</Badge> : null}
                </div>
                <p className="text-sm text-gris-texte">
                  {t("packaging", { label: product.packageLabel, capacity: formatQuantity(product.capacityMilli), unit: t(`units.${product.saleUnit}`) })}
                </p>
                {product.active ? (
                  <p className="montant mt-2 font-bold text-vert-fonce">
                    {t("pricePerUnit", { price: formatAmount(product.active.retailPrice), unit: t(`units.${product.saleUnit}`) })}
                    {product.active.formats.length ? (
                      <span className="font-normal text-gris-texte"> · {product.active.formats.map((f) => `${f.label} ${formatAmount(f.price)}`).join(" · ")}</span>
                    ) : null}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
