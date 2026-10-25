import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { customerHref } from "@/modules/customers";
import { listPendingRequests } from "@/modules/customers/server";
import { decideCancellationAction } from "@/modules/ledger/server";
import { formatAmount } from "@/shared/domain";
import { Card, ConfirmActionForm, Notice, PageHeader } from "@/shared/ui";
import { NoShop, requireShopPage } from "../_shell/shop";

/** Demandes d'annulation en attente : le propriétaire valide ou refuse (décision tracée). */
export default async function CancellationsPage({ searchParams }: { searchParams: Promise<{ decided?: string }> }) {
  const { shop } = await requireShopPage("decideCancellations");
  const { decided } = await searchParams;
  const t = await getTranslations();
  const format = await getFormatter();
  if (!shop) return <NoShop />;
  const requests = await listPendingRequests(shop.id);
  const date = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: shop.timezone });

  return (
    <>
      <PageHeader title={t("cancellations.title")} intro={t("cancellations.intro")} />
      {decided === "approved" || decided === "rejected" ? (
        <div className="mb-4">
          <Notice tone="positive">{t(`cancellations.${decided}`)}</Notice>
        </div>
      ) : null}
      {requests.length === 0 ? (
        <Card>
          <p className="text-gris-texte">{t("cancellations.empty")}</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((request) => (
            <li key={request.id}>
              <Card>
                <Link href={customerHref(request.customer.id)} className="text-lg font-bold text-encre hover:underline">
                  {request.customer.fullName}
                </Link>
                <p className="mt-1 text-encre">
                  {t("cancellations.operation", {
                    kind: t(`ledger.kinds.${request.operation.kind as "take"}`),
                    amount: formatAmount(request.operation.amount ?? 0),
                    date: date(request.operation.deviceCreatedAt),
                    author: request.operation.authorName,
                  })}
                </p>
                <p className="mt-2 rounded-bouton bg-safran-doux px-3 py-2 text-encre italic">{request.reason}</p>
                <p className="mt-1 text-sm text-gris-texte">{t("cancellations.requestedBy", { name: request.requestedBy, date: date(request.createdAt) })}</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <ConfirmActionForm
                    action={decideCancellationAction}
                    fields={{ requestId: request.id, approve: "true" }}
                    label={t("cancellations.approve")}
                    variant="primary"
                  />
                  <ConfirmActionForm
                    action={decideCancellationAction}
                    fields={{ requestId: request.id, approve: "false" }}
                    label={t("cancellations.reject")}
                    variant="ghost"
                  />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
