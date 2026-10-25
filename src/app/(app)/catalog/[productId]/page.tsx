import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { PriceChangeForm, ProductInfoForm } from "@/modules/catalog";
import { cancelPendingPriceAction, changePriceAction, getProduct, updateProductAction } from "@/modules/catalog/server";
import { getShopContext } from "@/modules/customers/server";
import { formatAmount, formatQuantity } from "@/shared/domain";
import { Badge, Card, ConfirmActionForm, Notice, PageHeader } from "@/shared/ui";
import { requireShopPage } from "../../_shell/shop";

export default async function ProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const { account } = await requireShopPage("manageCatalog");
  const { productId } = await params;
  const detail = await getProduct(productId);
  const shop = detail ? account.shops.find((s) => s.id === detail.product.shopId) : undefined;
  if (!detail || !shop) notFound();
  const { product, history } = detail;
  const t = await getTranslations("catalog");
  const format = await getFormatter();
  const context = await getShopContext(shop);
  const unit = t(`units.${product.saleUnit}`);
  const date = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: shop.timezone });
  const describeGrid = (v: { packagePrice: number | null; formats: { label: string; price: number }[] }) =>
    [v.packagePrice ? t("packagePriceShort", { price: formatAmount(v.packagePrice) }) : null, ...v.formats.map((f) => `${f.label} ${formatAmount(f.price)}`)]
      .filter(Boolean)
      .join(" · ");

  return (
    <>
      <PageHeader
        title={product.name}
        intro={t("packaging", { label: product.packageLabel, capacity: formatQuantity(product.capacityMilli), unit })}
        back={{ href: "/catalog", label: t("title") }}
        action={product.archived ? <Badge tone="warning">{t("archived")}</Badge> : null}
      />
      {product.pending ? (
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Notice>{t("pendingNotice", { price: formatAmount(product.pending.retailPrice), unit })}</Notice>
          <ConfirmActionForm action={cancelPendingPriceAction} fields={{ productId: product.id }} label={t("cancelPending")} variant="ghost" />
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          {product.active ? (
            <Card>
              <h2 className="mb-4 text-lg font-bold text-encre">{t("changePriceTitle")}</h2>
              <PriceChangeForm
                action={changePriceAction}
                productId={product.id}
                current={product.active}
                unitLabel={unit}
                roundingStep={context.settings.roundingStep}
                policies={{ hike: context.settings.priceHikePolicy, drop: context.settings.priceDropPolicy }}
              />
            </Card>
          ) : null}
          <Card>
            <h2 className="mb-2 text-lg font-bold text-encre">{t("history")}</h2>
            <ol className="flex flex-col divide-y divide-bordure">
              {history.map((v) => (
                <li key={v.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="montant font-bold text-encre">{t("pricePerUnit", { price: formatAmount(v.retailPrice), unit })}</p>
                    <Badge tone={v.status === "active" ? "positive" : v.status === "pending" ? "warning" : "neutral"}>{t(`status.${v.status}`)}</Badge>
                  </div>
                  <p className="montant text-sm text-gris-texte">{describeGrid(v)}</p>
                  <p className="text-sm text-gris-texte">
                    {t(`mode.${v.mode}`)}
                    <span> · </span>
                    {t("createdOn", { date: date(v.createdAt) })}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="mb-4 text-lg font-bold text-encre">{t("info")}</h2>
            <ProductInfoForm action={updateProductAction} product={product} />
          </Card>
          <Card>
            <ConfirmActionForm
              action={updateProductAction}
              fields={{
                productId: product.id,
                name: product.name,
                category: product.category ?? "",
                packageLabel: product.packageLabel,
                reorderThreshold: String(product.reorderThreshold),
                archived: product.archived ? "false" : "true",
              }}
              label={product.archived ? t("unarchive") : t("archive")}
              confirmText={product.archived ? undefined : t("archiveConfirm")}
              variant="ghost"
            />
          </Card>
        </div>
      </div>
    </>
  );
}
