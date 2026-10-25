"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { cancellationPath, OperationActions, PaymentForm, SavedBanner, TakeForm, type TakeDraft } from "@/modules/ledger";
import {
  mergeOperations,
  pendingRequestTargets,
  rejectionMessage,
  summarizeByCustomer,
  useOptionalSync,
  useLocalLines,
  useLocalShop,
  useSync,
  type LocalShopData,
  type ViewOperation,
} from "@/modules/sync";
import { formatAmount, formatPhone, formatQuantity, type RoundingStep } from "@/shared/domain";
import { Badge, Balance, Button, Card, Notice, PageHeader } from "@/shared/ui";
import { groupByDay, isOverLimit, limitUsage } from "../domain/customers";
import { CustomerList, type CustomerListItem } from "./CustomerList";
import { NewCustomerForm } from "./NewCustomerForm";

export interface CustomersAppProps {
  userId: string;
  role: "owner" | "manager" | "accountant" | "platformAdmin" | null;
  shop: { id: string; name: string; timezone: string };
  canRecord: boolean;
  canManage: boolean;
}

// ---------------------------------------------------------------------------
// Navigation par ancre (#/c/<id>/take…) : aucune requête au serveur, donc utilisable hors ligne,
// même à l'ouverture à froid (la page /customers est en cache).
// ---------------------------------------------------------------------------

type Route =
  | { view: "list" }
  | { view: "new" }
  | { view: "pick"; next: "take" | "payment" }
  | { view: "customer"; id: string }
  | { view: "take"; id: string }
  | { view: "payment"; id: string };

function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "new") return { view: "new" };
  if (parts[0] === "pick" && (parts[1] === "take" || parts[1] === "payment")) return { view: "pick", next: parts[1] };
  if (parts[0] === "c" && parts[1]) {
    if (parts[2] === "take") return { view: "take", id: parts[1] };
    if (parts[2] === "payment") return { view: "payment", id: parts[1] };
    return { view: "customer", id: parts[1] };
  }
  return { view: "list" };
}

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function CustomersApp(props: CustomersAppProps) {
  const t = useTranslations();
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  const route = parseHash(hash);
  const data = useLocalShop(props.shop.id);
  const engine = useOptionalSync()?.engine;
  const [saved, setSaved] = useState<{ id: string; kind: "take" | "payment" } | null>(null);
  const go = useCallback((target: string) => {
    window.location.hash = target;
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [hash]);

  // Données fraîches à l'ouverture (après une modification en ligne de la fiche, par exemple).
  useEffect(() => {
    void engine?.sync();
  }, [engine]);

  if (!data) return <p className="text-gris-texte">{t("sync.loading")}</p>;
  if (data.neverSynced && data.customers.length === 0) {
    return (
      <Card>
        <p className="text-gris-texte">{t("sync.firstSyncNeeded")}</p>
      </Card>
    );
  }

  const summaries = summarizeByCustomer(data.operations, data.outbox);
  const items: CustomerListItem[] = data.customers
    .filter((c) => !c.archived)
    .map((c) => {
      const s = summaries.get(c.id);
      return { id: c.id, fullName: c.fullName, phone: c.phone, type: c.type, balance: s?.balance ?? 0, lastOperationAt: s?.lastOperationAt ?? null, pending: c.localOnly };
    });

  switch (route.view) {
    case "new":
      return (
        <div className="mx-auto max-w-2xl">
          <PageHeader title={t("customers.new")} back={{ href: "#/", label: t("customers.title") }} />
          <Card>
            <NewCustomerForm shopId={props.shop.id} defaultAlertThreshold={data.shop?.settings.advanceAlertThreshold ?? 1000} onCreated={(id) => go(`#/c/${id}`)} />
          </Card>
        </div>
      );
    case "pick":
      return (
        <>
          <PageHeader title={route.next === "take" ? t("ledger.pick.takeTitle") : t("ledger.pick.paymentTitle")} back={{ href: "/", label: t("nav.home") }} />
          <CustomerList customers={items} hrefFor={(id) => `#/c/${id}/${route.next}`} autoFocus />
        </>
      );
    case "customer":
    case "take":
    case "payment": {
      const customer = data.customers.find((c) => c.id === route.id);
      if (!customer) {
        return (
          <Card>
            <p className="text-gris-texte">{t("errors.notFound")}</p>
          </Card>
        );
      }
      const balance = summaries.get(customer.id)?.balance ?? 0;
      if (route.view === "take" && props.canRecord && !customer.archived) {
        return <TakeScreen {...props} data={data} customer={customer} balance={balance} onSaved={(id) => (setSaved({ id, kind: "take" }), go(`#/c/${customer.id}`))} />;
      }
      if (route.view === "payment" && props.canRecord && !customer.archived) {
        return <PaymentScreen {...props} data={data} customer={customer} balance={balance} onSaved={(id) => (setSaved({ id, kind: "payment" }), go(`#/c/${customer.id}`))} />;
      }
      return <CustomerSheet {...props} data={data} customerId={customer.id} balance={balance} saved={saved} onCloseSaved={() => setSaved(null)} />;
    }
    default:
      return (
        <>
          <PageHeader
            title={t("customers.title")}
            action={
              props.canManage ? (
                <a href={"#/new"} className="inline-flex min-h-12 items-center rounded-bouton bg-vert-doux px-5 font-bold text-vert-fonce">
                  {t("customers.new")}
                </a>
              ) : null
            }
          />
          <CustomerList customers={items} hrefFor={(id) => `#/c/${id}`} />
        </>
      );
  }
}

// ---------------------------------------------------------------------------
// Saisies
// ---------------------------------------------------------------------------

type ScreenProps = CustomersAppProps & { data: LocalShopData; customer: LocalShopData["customers"][number]; balance: number; onSaved: (id: string) => void };

function TakeScreen({ data, customer, balance, shop, onSaved }: ScreenProps) {
  const t = useTranslations("ledger");
  const { engine } = useSync();
  const save = (draft: TakeDraft) => {
    void engine.enqueue(
      {
        type: "take",
        customerId: customer.id,
        shopId: shop.id,
        mode: draft.mode,
        amount: draft.amount,
        note: draft.note,
        lines: draft.lines.map((l) => ({ label: l.label, quantity_milli: l.quantity, unit: l.unit, unit_price: l.unitPrice, line_amount: l.lineAmount })),
      },
      draft.id,
    );
    onSaved(draft.id);
  };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("takeTitle")} intro={customer.fullName} back={{ href: `#/c/${customer.id}`, label: customer.fullName }} action={<CurrentBalance balance={balance} />} />
      <TakeForm onSave={save} balance={balance} creditLimit={customer.creditLimit} roundingStep={(data.shop?.settings.roundingStep ?? 5) as RoundingStep} />
    </div>
  );
}

function PaymentScreen({ data, customer, balance, shop, onSaved }: ScreenProps) {
  const t = useTranslations();
  const { engine } = useSync();
  const methods = (data.shop?.paymentMethods ?? []).filter((m) => m.active);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("ledger.paymentTitle")} intro={customer.fullName} back={{ href: `#/c/${customer.id}`, label: customer.fullName }} action={<CurrentBalance balance={balance} />} />
      {methods.length === 0 ? (
        <Notice>{t("sync.firstSyncNeeded")}</Notice>
      ) : (
        <PaymentForm
          balance={balance}
          methods={methods}
          onSave={(draft) => {
            void engine.enqueue({ type: "payment", customerId: customer.id, shopId: shop.id, amount: draft.amount, paymentMethodId: draft.paymentMethodId, note: draft.note }, draft.id);
            onSaved(draft.id);
          }}
        />
      )}
    </div>
  );
}

function CurrentBalance({ balance }: { balance: number }) {
  const t = useTranslations("ledger");
  return (
    <div className="text-right">
      <p className="text-xs font-semibold text-gris-texte">{t("currentBalance")}</p>
      <Balance value={balance} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fiche client (lue sur l'appareil)
// ---------------------------------------------------------------------------

interface SheetOperation extends ViewOperation {
  note: string | null;
  takeMode: "quick" | "detailed" | null;
  paymentMethodId: string | null;
  cancellationReason: string | null;
  lines: { label: string; quantityMilli: number; unit: string; unitPrice: number; lineAmount: number }[];
  rejectedCode?: string;
}

function CustomerSheet({
  data,
  customerId,
  balance,
  userId,
  role,
  shop,
  canRecord,
  canManage,
  saved,
  onCloseSaved,
}: CustomersAppProps & {
  data: LocalShopData;
  customerId: string;
  balance: number;
  saved: { id: string; kind: "take" | "payment" } | null;
  onCloseSaved: () => void;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const { engine, lateCancellationReason } = useSync();
  const customer = data.customers.find((c) => c.id === customerId)!;
  const settings = data.shop?.settings;
  const serverOps = useMemo(() => data.operations.filter((o) => o.customerId === customerId), [data.operations, customerId]);
  const lineIds = useMemo(() => serverOps.filter((o) => o.takeMode === "detailed").map((o) => o.id), [serverOps]);
  const serverLines = useLocalLines(lineIds);

  const operations: SheetOperation[] = useMemo(() => {
    const byId = new Map(serverOps.map((o) => [o.id, o]));
    const entries = new Map(data.outbox.map((e) => [e.id, e]));
    return mergeOperations(serverOps, data.outbox, customerId).map((op) => {
      const server = byId.get(op.id);
      const command = entries.get(op.id)?.command;
      return {
        ...op,
        note: server?.note ?? (command && "note" in command ? command.note : null),
        takeMode: server?.takeMode ?? (command?.type === "take" ? command.mode : null),
        paymentMethodId: server?.paymentMethodId ?? (command?.type === "payment" ? command.paymentMethodId : null),
        cancellationReason: server?.cancellationReason ?? (command?.type === "cancel" ? command.reason : null),
        lines: server
          ? serverLines.filter((l) => l.operationId === op.id)
          : command?.type === "take"
            ? command.lines.map((l) => ({ label: l.label, quantityMilli: l.quantity_milli, unit: l.unit, unitPrice: l.unit_price, lineAmount: l.line_amount }))
            : [],
        rejectedCode: entries.get(op.id)?.error,
      };
    });
  }, [serverOps, serverLines, data.outbox, customerId]);

  const counted = operations.filter((o) => !o.rejected);
  const cancelledIds = new Set(counted.filter((o) => o.kind === "cancellation").map((o) => o.cancelsOperationId));
  const requested = pendingRequestTargets(data.outbox);
  for (const r of data.requests) if (r.status === "pending") requested.add(r.operationId);
  const now = new Date();
  const pathFor = (op: SheetOperation) =>
    canRecord && !op.rejected
      ? cancellationPath({
          role,
          userId,
          operation: op,
          alreadyCancelled: cancelledIds.has(op.id) || requested.has(op.id),
          now,
          windowMinutes: settings?.cancelWindowMinutes ?? 15,
        })
      : "none";
  const cancel = (operationId: string) =>
    void engine.enqueue({ type: "cancel", customerId, shopId: shop.id, operationId, reason: null, fallbackReason: lateCancellationReason });
  const request = (operationId: string, reason: string) => void engine.enqueue({ type: "request", customerId, shopId: shop.id, operationId, reason });
  const methodLabel = (id: string | null) => {
    const m = data.shop?.paymentMethods.find((x) => x.id === id);
    return !m ? "" : m.kind === "custom" ? (m.label ?? "") : t(`ledger.methods.${m.kind}`);
  };
  const usage = limitUsage(balance, customer.creditLimit);
  const over = isOverLimit(balance, customer.creditLimit);
  const lastPayment = counted.filter((o) => o.kind === "payment" && !cancelledIds.has(o.id)).map((o) => o.deviceCreatedAt).sort().at(-1);
  const dueDay = customer.monthlyDueDay ?? settings?.monthlyDueDay ?? null;
  const savedOp = saved ? operations.find((o) => o.id === saved.id) : undefined;
  const time = (iso: string) => format.dateTime(new Date(iso), { hour: "2-digit", minute: "2-digit", timeZone: shop.timezone });

  return (
    <>
      <PageHeader
        title={customer.fullName}
        intro={`${t(`customers.types.${customer.type}`)}${customer.phone ? ` · ${formatPhone(customer.phone)}` : ""}`}
        back={{ href: "#/", label: t("customers.title") }}
        action={customer.archived ? <Badge tone="warning">{t("customers.archived")}</Badge> : customer.localOnly ? <Badge tone="warning">{t("sync.pendingShort")}</Badge> : null}
      />
      {saved && savedOp ? (
        <div className="mb-4">
          <SavedBanner
            key={saved.id}
            kind={saved.kind}
            canUndo={!cancelledIds.has(saved.id) && pathFor(savedOp) === "direct"}
            onUndo={() => cancel(saved.id)}
            onClose={onCloseSaved}
          />
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
              <Balance value={balance} size="xl" />
            </div>
            {customer.creditLimit ? (
              <div className="mt-4">
                <div className="h-3 overflow-hidden rounded-full bg-fond" aria-hidden="true">
                  <div className={`h-full rounded-full ${over ? "bg-brique" : "bg-safran"}`} style={{ width: `${Math.min(100, Math.round((usage ?? 0) * 100))}%` }} />
                </div>
                <p className="mt-1 text-sm text-gris-texte">
                  {over
                    ? t("customers.overLimit", { amount: formatAmount(-balance - customer.creditLimit) })
                    : t("customers.limitUsed", { used: formatAmount(Math.max(0, -balance)), limit: formatAmount(customer.creditLimit) })}
                </p>
              </div>
            ) : null}
            <ul className="mt-4 space-y-1 text-sm text-gris-texte">
              {customer.type === "monthly" ? <li>{dueDay ? t("customers.dueDay", { day: dueDay }) : t("customers.dueEndOfMonth")}</li> : null}
              <li>
                {lastPayment
                  ? t("customers.lastPayment", { date: format.dateTime(new Date(lastPayment), { day: "numeric", month: "short", year: "numeric", timeZone: shop.timezone }) })
                  : t("customers.neverPaid")}
              </li>
              {customer.note ? <li className="italic">{customer.note}</li> : null}
            </ul>
          </Card>

          {canRecord && !customer.archived ? (
            <div className="grid grid-cols-2 gap-3">
              <a href={`#/c/${customer.id}/take`} className="inline-flex min-h-12 items-center justify-center rounded-bouton bg-safran px-4 font-bold text-encre">
                {t("customers.actions.take")}
              </a>
              <a href={`#/c/${customer.id}/payment`} className="inline-flex min-h-12 items-center justify-center rounded-bouton bg-vert-principal px-4 font-bold text-white">
                {t("customers.actions.payment")}
              </a>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            {customer.phone ? (
              <a href={`tel:${customer.phone}`} className="inline-flex min-h-12 items-center justify-center rounded-bouton bg-vert-doux font-bold text-vert-fonce">
                {t("customers.actions.call")}
              </a>
            ) : null}
            {canManage && !customer.localOnly ? (
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
              {groupByDay(operations, shop.timezone).map((group) => (
                <section key={group.date}>
                  <h3 className="mb-2 text-sm font-bold tracking-wide text-gris-texte uppercase">
                    {format.dateTime(new Date(`${group.date}T12:00:00Z`), { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
                  </h3>
                  <ul className="flex flex-col divide-y divide-bordure rounded-bouton border border-bordure">
                    {group.items.map((op) => (
                      <li key={op.id} className="px-4 py-3">
                        <OperationLine
                          op={op}
                          cancelled={cancelledIds.has(op.id)}
                          requested={requested.has(op.id)}
                          authorName={data.profiles.get(op.authorId) ?? ""}
                          methodLabel={methodLabel(op.paymentMethodId)}
                          time={time(op.deviceCreatedAt)}
                        />
                        {op.rejected ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge tone="danger">{t("sync.rejectedBadge", { reason: t(`errors.${rejectionMessage(op.rejectedCode)}`) })}</Badge>
                            <Button variant="ghost" className="min-h-11 px-3 text-sm" onClick={() => void engine.dismissRejected(op.id)}>
                              {t("sync.dismiss")}
                            </Button>
                          </div>
                        ) : (
                          <OperationActions path={pathFor(op)} onCancel={() => cancel(op.id)} onRequest={(reason) => request(op.id, reason)} />
                        )}
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

function OperationLine({
  op,
  cancelled,
  requested,
  authorName,
  methodLabel,
  time,
}: {
  op: SheetOperation;
  cancelled: boolean;
  requested: boolean;
  authorName: string;
  methodLabel: string;
  time: string;
}) {
  const t = useTranslations();
  const meta = (
    <p className="text-sm text-gris-texte">
      {time}
      {authorName ? <span> · {t("ledger.by", { name: authorName })}</span> : null}
      {op.pending ? <span className="font-semibold text-safran"> · {t("sync.pendingShort")}</span> : null}
    </p>
  );
  if (op.kind === "cancellation") {
    return (
      <div className="text-sm text-gris-texte">
        <p className="font-semibold">{t("ledger.kinds.cancellation")}</p>
        {op.cancellationReason ? <p className="italic">{op.cancellationReason}</p> : null}
        {meta}
      </div>
    );
  }
  const strike = cancelled || op.rejected ? "line-through" : "";
  const sign = op.kind === "take" ? -1 : 1;
  return (
    <div className={`flex items-start justify-between gap-3 ${strike ? "text-gris-texte" : ""}`}>
      <div className="min-w-0">
        <p className={`font-semibold text-encre ${strike}`}>
          {t(`ledger.kinds.${op.kind}`)}
          {op.kind === "payment" && methodLabel ? <span className="font-normal text-gris-texte"> · {methodLabel}</span> : null}
        </p>
        {op.lines.length ? (
          <ul className={`text-sm text-gris-texte ${strike}`}>
            {op.lines.map((line, index) => (
              <li key={index} className="montant">
                {line.label}
                <span> · </span>
                {t("ledger.lineSummary", { quantity: formatQuantity(line.quantityMilli), unit: t(`ledger.units.${line.unit as "kg"}`), price: formatAmount(line.unitPrice) })}
                <span> = </span>
                {formatAmount(line.lineAmount)}
              </li>
            ))}
          </ul>
        ) : null}
        {op.note ? <p className={`text-sm text-gris-texte ${strike}`}>{op.note}</p> : null}
        {meta}
        {cancelled ? (
          <p className="mt-1">
            <Badge tone="danger">{t("ledger.cancelled")}</Badge>
          </p>
        ) : null}
        {requested && !cancelled ? (
          <p className="mt-1">
            <Badge tone="warning">{t("ledger.pendingRequestShort")}</Badge>
          </p>
        ) : null}
      </div>
      <span className={`montant shrink-0 text-lg font-extrabold ${strike ? "text-gris-texte line-through" : sign < 0 ? "text-brique" : "text-vert-positif"}`}>
        {formatAmount(sign * (op.amount ?? 0), { signDisplay: "always" })}
      </span>
    </div>
  );
}
