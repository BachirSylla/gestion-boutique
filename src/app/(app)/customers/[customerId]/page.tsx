import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { can } from "@/modules/auth-accounts";
import { requirePageAccount } from "@/modules/auth-accounts/server";
import { groupByDay, isOverLimit, limitUsage } from "@/modules/customers";
import { getCustomerDetail, getShopContext, type OperationRow } from "@/modules/customers/server";
import { cancellationPath, OperationActions, SavedBanner } from "@/modules/ledger";
import { cancelOperationAction, requestCancellationAction } from "@/modules/ledger/server";
import { formatAmount, formatPhone, formatQuantity } from "@/shared/domain";
import { Badge, Balance, Card, LinkButton, Notice, PageHeader } from "@/shared/ui";

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const account = await requirePageAccount("viewCustomers");
  const [{ customerId }, { saved }] = await Promise.all([params, searchParams]);
  const detail = await getCustomerDetail(customerId);
  if (!detail) notFound();
  const { customer, operations } = detail;
  const shop = account.shops.find((s) => s.id === customer.shopId);
  if (!shop) notFound();
  const t = await getTranslations();
  const format = await getFormatter();
  const context = await getShopContext(shop);
  const timeZone = shop.timezone;
  const now = new Date();
  const canRecord = can(account.role, "recordOperations") && !customer.archived;
  const usage = limitUsage(customer.balance, customer.creditLimit);
  // Le bandeau reste affiché après « Annuler » (l'opération est alors annulée) pour confirmer l'annulation.
  const savedOp = saved ? operations.find((o) => o.id === saved && o.kind !== "cancellation") : undefined;
  const pathFor = (op: OperationRow) =>
    canRecord
      ? cancellationPath({
          role: account.role,
          userId: account.userId,
          operation: op,
          alreadyCancelled: !!op.cancelledBy || !!op.pendingRequest,
          now,
          windowMinutes: context.settings.cancelWindowMinutes,
        })
      : "none";
  const methodLabel = (id: string | null) => {
    const method = context.paymentMethods.find((m) => m.id === id);
    if (!method) return "";
    return method.kind === "custom" ? (method.label ?? "") : t(`ledger.methods.${method.kind}`);
  };
  const dueLabel =
    customer.type === "monthly"
      ? customer.monthlyDueDay || context.settings.monthlyDueDay
        ? t("customers.dueDay", { day: customer.monthlyDueDay ?? context.settings.monthlyDueDay! })
        : t("customers.dueEndOfMonth")
      : null;

  return (
    <>
      <PageHeader
        title={customer.fullName}
        intro={`${t(`customers.types.${customer.type}`)}${customer.phone ? ` · ${formatPhone(customer.phone)}` : ""}`}
        back={{ href: "/customers", label: t("customers.title") }}
        action={customer.archived ? <Badge tone="warning">{t("customers.archived")}</Badge> : null}
      />

      {savedOp && (savedOp.kind === "take" || savedOp.kind === "payment") ? (
        <div className="mb-4">
          <SavedBanner kind={savedOp.kind} operationId={savedOp.id} customerId={customer.id} canUndo={!savedOp.cancelledBy && pathFor(savedOp) === "direct"} cancelAction={cancelOperationAction} />
        </div>
      ) : null}
      {customer.archived ? (
        <div className="mb-4">
          <Notice>{t("customers.archivedNotice")}</Notice>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-gris-texte">{t("customers.balance")}</p>
              <Balance value={customer.balance} size="xl" />
            </div>
            {customer.creditLimit ? (
              <div className="mt-4">
                <div
                  className="h-3 overflow-hidden rounded-full bg-fond"
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={customer.creditLimit}
                  aria-valuenow={Math.min(customer.creditLimit, Math.max(0, -customer.balance))}
                  aria-label={t("customers.limitUsed", { used: formatAmount(Math.max(0, -customer.balance)), limit: formatAmount(customer.creditLimit) })}
                >
                  <div
                    className={`h-full rounded-full ${isOverLimit(customer.balance, customer.creditLimit) ? "bg-brique" : "bg-safran"}`}
                    style={{ width: `${Math.min(100, Math.round((usage ?? 0) * 100))}%` }}
                  />
                </div>
                <p className="mt-1 text-sm text-gris-texte">
                  {isOverLimit(customer.balance, customer.creditLimit)
                    ? t("customers.overLimit", { amount: formatAmount(-customer.balance - customer.creditLimit) })
                    : t("customers.limitUsed", { used: formatAmount(Math.max(0, -customer.balance)), limit: formatAmount(customer.creditLimit) })}
                </p>
              </div>
            ) : null}
            <ul className="mt-4 space-y-1 text-sm text-gris-texte">
              {dueLabel ? <li>{dueLabel}</li> : null}
              <li>
                {customer.lastPaymentAt
                  ? t("customers.lastPayment", { date: format.dateTime(new Date(customer.lastPaymentAt), { day: "numeric", month: "short", year: "numeric", timeZone }) })
                  : t("customers.neverPaid")}
              </li>
              {customer.note ? <li className="italic">{customer.note}</li> : null}
            </ul>
          </Card>

          {canRecord ? (
            <div className="grid grid-cols-2 gap-3">
              <LinkButton href={`/customers/${customer.id}/take`} variant="accent">
                {t("customers.actions.take")}
              </LinkButton>
              <LinkButton href={`/customers/${customer.id}/payment`} variant="primary">
                {t("customers.actions.payment")}
              </LinkButton>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            {customer.phone ? (
              <a href={`tel:${customer.phone}`} className="inline-flex min-h-12 items-center justify-center rounded-bouton bg-vert-doux font-bold text-vert-fonce">
                {t("customers.actions.call")}
              </a>
            ) : null}
            {can(account.role, "manageCustomers") ? (
              <Link href={`/customers/${customer.id}/edit`} className="inline-flex min-h-12 items-center justify-center rounded-bouton bg-vert-doux font-bold text-vert-fonce">
                {t("customers.edit")}
              </Link>
            ) : null}
          </div>
        </div>

        <Card>
          <h2 className="text-lg font-bold text-encre">{t("customers.history")}</h2>
          {operations.length === 0 ? (
            <p className="mt-2 text-gris-texte">{t("customers.noHistory")}</p>
          ) : (
            <div className="mt-3 flex flex-col gap-5">
              {groupByDay(operations, timeZone).map((group) => (
                <section key={group.date}>
                  <h3 className="mb-2 text-sm font-bold tracking-wide text-gris-texte uppercase">
                    {format.dateTime(new Date(`${group.date}T12:00:00Z`), { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
                  </h3>
                  <ul className="flex flex-col divide-y divide-bordure rounded-bouton border border-bordure">
                    {group.items.map((op) => (
                      <li key={op.id} className="px-4 py-3">
                        <OperationLine op={op} methodLabel={methodLabel(op.paymentMethodId)} time={format.dateTime(new Date(op.deviceCreatedAt), { hour: "2-digit", minute: "2-digit", timeZone })} />
                        <OperationActions
                          path={pathFor(op)}
                          operationId={op.id}
                          customerId={customer.id}
                          cancelAction={cancelOperationAction}
                          requestAction={requestCancellationAction}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

async function OperationLine({ op, methodLabel, time }: { op: OperationRow; methodLabel: string; time: string }) {
  const t = await getTranslations("ledger");
  const cancelled = !!op.cancelledBy;
  if (op.kind === "cancellation") {
    return (
      <div className="flex items-start justify-between gap-3 text-sm text-gris-texte">
        <div>
          <p className="font-semibold">{t("kinds.cancellation")}</p>
          {op.cancellationReason ? <p className="italic">{op.cancellationReason}</p> : null}
          <p>
            {time} · {t("by", { name: op.authorName })}
          </p>
        </div>
      </div>
    );
  }
  const sign = op.kind === "take" ? -1 : 1;
  return (
    <div className={`flex items-start justify-between gap-3 ${cancelled ? "text-gris-texte" : ""}`}>
      <div className="min-w-0">
        <p className={`font-semibold text-encre ${cancelled ? "line-through" : ""}`}>
          {t(`kinds.${op.kind}`)}
          {op.kind === "payment" && methodLabel ? <span className="font-normal text-gris-texte"> · {methodLabel}</span> : null}
        </p>
        {op.lines.length ? (
          <ul className={`text-sm text-gris-texte ${cancelled ? "line-through" : ""}`}>
            {op.lines.map((line, index) => (
              <li key={index} className="montant">
                {line.label}
                <span> · </span>
                {t("lineSummary", { quantity: formatQuantity(line.quantityMilli), unit: t(`units.${line.unit as "kg"}`), price: formatAmount(line.unitPrice) })}
                <span> = </span>
                {formatAmount(line.lineAmount)}
              </li>
            ))}
          </ul>
        ) : null}
        {op.note ? <p className={`text-sm text-gris-texte ${cancelled ? "line-through" : ""}`}>{op.note}</p> : null}
        <p className="text-sm text-gris-texte">
          {time} · {t("by", { name: op.authorName })}
        </p>
        {cancelled ? (
          <p className="mt-1">
            <Badge tone="danger">{t("cancelled")}</Badge>
          </p>
        ) : null}
        {op.pendingRequest ? (
          <p className="mt-1">
            <Badge tone="warning">{t("pendingRequest", { reason: op.pendingRequest.reason })}</Badge>
          </p>
        ) : null}
        {op.lastDecision?.status === "rejected" && !cancelled ? (
          <p className="mt-1">
            <Badge>{t("requestRejected")}</Badge>
          </p>
        ) : null}
      </div>
      <span className={`montant shrink-0 text-lg font-extrabold ${cancelled ? "text-gris-texte line-through" : sign < 0 ? "text-brique" : "text-vert-positif"}`}>
        {formatAmount(sign * (op.amount ?? 0), { signDisplay: "always" })}
      </span>
    </div>
  );
}
