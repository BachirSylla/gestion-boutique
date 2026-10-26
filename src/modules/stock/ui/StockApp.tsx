"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { cancellationPath, OperationActions } from "@/modules/ledger";
import { rejectionMessage, summarizeByCustomer, useLocalShop, useOptionalSync, type LocalShopData, type OutboxEntry } from "@/modules/sync";
import { formatAmount, formatQuantity } from "@/shared/domain";
import { AmountInput, Badge, Button, Card, ChoiceGroup, Notice, PageHeader, TextField } from "@/shared/ui";
import { ESTIMATE_CHOICES, estimateKey, inventoryDelta, needsReorder, ruptureEstimate, type StockView } from "../domain/stock";
import { useProductStocks, type ProductStock } from "./useProductStocks";

export interface StockAppProps {
  userId: string;
  role: "owner" | "manager" | "accountant" | "platformAdmin" | null;
  shop: { id: string; name: string; timezone: string };
  canRecord: boolean;
}

type Route = { view: "list" } | { view: "inventory" } | { view: "product"; id: string } | { view: "receive"; id: string } | { view: "sell"; id: string };

function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "inventory") return { view: "inventory" };
  if (parts[0] === "p" && parts[1]) {
    if (parts[2] === "receive") return { view: "receive", id: parts[1] };
    if (parts[2] === "sell") return { view: "sell", id: parts[1] };
    return { view: "product", id: parts[1] };
  }
  return { view: "list" };
}

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function StockApp(props: StockAppProps) {
  const t = useTranslations();
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  const route = parseHash(hash);
  const data = useLocalShop(props.shop.id);
  const engine = useOptionalSync()?.engine;
  const stocks = useProductStocks(data);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [hash]);
  useEffect(() => {
    void engine?.sync();
  }, [engine]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!data || !engine) return <p className="text-gris-texte">{t("sync.loading")}</p>;
  if (data.neverSynced && data.products.length === 0) {
    return (
      <Card>
        <p className="text-gris-texte">{t("sync.firstSyncNeeded")}</p>
      </Card>
    );
  }

  const enqueue = (command: Parameters<typeof engine.enqueue>[0], message?: string) => {
    void engine.enqueue(command);
    if (message) setNotice(message);
  };
  const go = (target: string) => {
    window.location.hash = target;
  };

  const banner = notice ? (
    <div className="mb-4">
      <Notice tone="positive">{notice}</Notice>
    </div>
  ) : null;

  if (route.view === "inventory") {
    return <InventoryScreen stocks={stocks} canRecord={props.canRecord} shopId={props.shop.id} onDone={(message) => (setNotice(message), go("#/"))} enqueue={enqueue} />;
  }

  if (route.view !== "list") {
    const stock = stocks.find((s) => s.product.id === route.id);
    if (!stock) {
      return (
        <Card>
          <p className="text-gris-texte">{t("errors.notFound")}</p>
        </Card>
      );
    }
    if (route.view === "receive" && props.canRecord) {
      return <ReceiveScreen stock={stock} shopId={props.shop.id} onDone={(message) => (enqueue(message.command, message.text), go(`#/p/${stock.product.id}`))} />;
    }
    if (route.view === "sell" && props.canRecord) {
      return <SellScreen stock={stock} data={data} shopId={props.shop.id} onDone={(message) => (enqueue(message.command, message.text), go(`#/p/${stock.product.id}`))} />;
    }
    return (
      <>
        {banner}
        <ProductScreen {...props} stock={stock} data={data} enqueue={enqueue} />
      </>
    );
  }

  return (
    <>
      {banner}
      <StockList stocks={stocks} canRecord={props.canRecord} shopId={props.shop.id} enqueue={enqueue} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------

type Filter = "all" | "opened" | "reorder";

function StockList({
  stocks,
  canRecord,
  shopId,
  enqueue,
}: {
  stocks: ProductStock[];
  canRecord: boolean;
  shopId: string;
  enqueue: (command: OutboxEntry["command"], message?: string) => void;
}) {
  const t = useTranslations("stock");
  const [filter, setFilter] = useState<Filter>("all");
  const visible = stocks.filter((s) => (filter === "opened" ? !!s.view.opened : filter === "reorder" ? needsReorder(s.view.closed, s.product.reorderThreshold) : true));

  return (
    <>
      <PageHeader
        title={t("title")}
        action={
          canRecord ? (
            <a href="#/inventory" className="inline-flex min-h-12 items-center rounded-bouton bg-vert-doux px-5 font-bold text-vert-fonce">
              {t("inventory.title")}
            </a>
          ) : null
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", "opened", "reorder"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ${filter === value ? "bg-vert-principal text-white" : "bg-surface text-encre ring-1 ring-bordure"}`}
          >
            {t(`filters.${value}`)}
          </button>
        ))}
      </div>
      {stocks.length === 0 ? (
        <Card>
          <p className="text-gris-texte">{t("emptyCatalog")}</p>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <p className="text-gris-texte">{t("noResult")}</p>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((stock) => (
            <li key={stock.product.id}>
              <StockCard stock={stock} canRecord={canRecord} shopId={shopId} enqueue={enqueue} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function StockCard({ stock, canRecord, shopId, enqueue }: { stock: ProductStock; canRecord: boolean; shopId: string; enqueue: (command: OutboxEntry["command"], message?: string) => void }) {
  const t = useTranslations("stock");
  const format = useFormatter();
  const { product, view } = stock;
  const rupture = ruptureEstimate(view, stock.durations, new Date());
  const reorder = needsReorder(view.closed, product.reorderThreshold);
  return (
    <article className={`flex h-full flex-col gap-3 rounded-carte border bg-surface p-4 ${reorder ? "border-safran" : "border-bordure"}`}>
      <a href={`#/p/${product.id}`} className="flex items-start justify-between gap-2">
        <span>
          <span className="block text-lg font-bold text-encre">{product.name}</span>
          <span className="block text-sm text-gris-texte">{t("packaging", { label: product.packageLabel, capacity: formatQuantity(product.capacityMilli), unit: t(`units.${product.saleUnit}`) })}</span>
        </span>
        {reorder ? <Badge tone="warning">{t("toReorder")}</Badge> : null}
      </a>
      <SackPictos view={view} />
      <p className="text-sm text-encre" data-testid="stock-summary">
        {t("closedCount", { count: view.closed, label: product.packageLabel })}
        {view.opened ? <span> · {t("openedWith", { remaining: t(`estimates.${estimateKey(view.opened.remaining)}`) })}</span> : null}
        {stock.pending ? <span className="font-semibold text-safran"> · {t("pendingShort")}</span> : null}
      </p>
      {rupture ? (
        <p className="text-xs text-gris-texte">{t("rupture", { date: format.dateTime(rupture.date, { day: "numeric", month: "short" }), days: rupture.days })}</p>
      ) : null}
      {canRecord ? (
        <div className="mt-auto grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            disabled={!!view.opened || view.closed === 0}
            onClick={() => enqueue({ type: "stock.open", shopId, productId: product.id }, t("opened", { product: product.name }))}
          >
            {t("actions.open")}
          </Button>
          <Button
            variant="secondary"
            disabled={!view.opened}
            onClick={() => {
              if (window.confirm(t("finishConfirm", { product: product.name }))) enqueue({ type: "stock.finish", shopId, productId: product.id }, t("finished", { product: product.name }));
            }}
          >
            {t("actions.finish")}
          </Button>
        </div>
      ) : null}
    </article>
  );
}

/** Pictos de sacs : pleins (fermés) et entamé (rempli selon le reste estimé). */
function SackPictos({ view }: { view: StockView }) {
  const t = useTranslations("stock");
  const shown = Math.min(view.closed, 8);
  const fill = view.opened ? Math.max(0.1, (view.opened.remaining ?? 500) / 1000) : 0;
  return (
    <div className="flex flex-wrap items-end gap-1" role="img" aria-label={t("pictoLabel", { closed: view.closed, opened: view.opened ? 1 : 0 })}>
      {view.opened ? <Sack fill={fill} opened /> : null}
      {Array.from({ length: shown }, (_, i) => (
        <Sack key={i} fill={1} />
      ))}
      {view.closed > shown ? <span className="montant ml-1 text-sm font-bold text-gris-texte">{["+", view.closed - shown].join("")}</span> : null}
    </div>
  );
}

function Sack({ fill, opened = false }: { fill: number; opened?: boolean }) {
  const height = 24 * fill;
  return (
    <svg width="26" height="32" viewBox="0 0 26 32" aria-hidden="true">
      <path d="M5 6h16l2 24H3z" fill="var(--fond)" stroke="var(--vert-principal)" strokeWidth="1.5" />
      <clipPath id={`clip-${opened ? "o" : "c"}-${Math.round(fill * 100)}`}>
        <path d="M5 6h16l2 24H3z" />
      </clipPath>
      <rect x="0" y={30 - height} width="26" height={height} fill={opened ? "var(--safran)" : "var(--vert-principal)"} clipPath={`url(#clip-${opened ? "o" : "c"}-${Math.round(fill * 100)})`} />
      <path d={opened ? "M5 6l3-4M21 6l-3-4" : "M8 6c2-3 8-3 10 0"} stroke="var(--vert-principal)" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Fiche produit : actions, reste estimé, bilans, mouvements
// ---------------------------------------------------------------------------

function ProductScreen({
  stock,
  data,
  userId,
  role,
  shop,
  canRecord,
  enqueue,
}: StockAppProps & { stock: ProductStock; data: LocalShopData; enqueue: (command: OutboxEntry["command"], message?: string) => void }) {
  const t = useTranslations();
  const format = useFormatter();
  const lateReason = t("sync.lateCancellationReason");
  const { product, view } = stock;
  const date = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: shop.timezone });
  const reviews = data.reviews.filter((r) => r.productId === product.id).sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""));
  const movements = data.movements.filter((m) => m.productId === product.id).sort((a, b) => b.deviceCreatedAt.localeCompare(a.deviceCreatedAt));
  const pendingMoves = data.outbox.filter((e) => "productId" in e.command && e.command.productId === product.id);
  const cancelled = new Set([
    ...movements.filter((m) => m.cancelsMovementId).map((m) => m.cancelsMovementId),
    ...pendingMoves.flatMap((e) => (e.command.type === "stock.cancel" ? [e.command.movementId] : [])),
  ]);
  const requested = new Set([
    ...data.requests.filter((r) => r.status === "pending" && r.stockMovementId).map((r) => r.stockMovementId),
    ...pendingMoves.flatMap((e) => (e.command.type === "stock.request" && e.status === "pending" ? [e.command.movementId] : [])),
  ]);
  const windowMinutes = data.shop?.settings.cancelWindowMinutes ?? 15;
  const now = new Date();

  return (
    <>
      <PageHeader
        title={product.name}
        intro={t("stock.packaging", { label: product.packageLabel, capacity: formatQuantity(product.capacityMilli), unit: t(`stock.units.${product.saleUnit}`) })}
        back={{ href: "#/", label: t("stock.title") }}
      />
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <div className="flex flex-col gap-4">
          <Card>
            <SackPictos view={view} />
            <p className="mt-3 text-encre">{t("stock.closedCount", { count: view.closed, label: product.packageLabel })}</p>
            <p className="text-encre">
              {view.opened ? t("stock.openedWith", { remaining: t(`stock.estimates.${estimateKey(view.opened.remaining)}`) }) : t("stock.noneOpened")}
            </p>
            {product.retailPrice ? <p className="montant mt-2 text-sm text-gris-texte">{t("stock.retail", { price: formatAmount(product.retailPrice), unit: t(`stock.units.${product.saleUnit}`) })}</p> : null}
            {product.pendingRetailPrice ? <p className="mt-1 text-sm font-semibold text-encre">{t("stock.pendingPrice", { price: formatAmount(product.pendingRetailPrice) })}</p> : null}
          </Card>
          {canRecord ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="accent" disabled={!!view.opened || view.closed === 0} onClick={() => enqueue({ type: "stock.open", shopId: shop.id, productId: product.id }, t("stock.opened", { product: product.name }))}>
                  {t("stock.actions.open")}
                </Button>
                <Button
                  variant="primary"
                  disabled={!view.opened}
                  onClick={() => {
                    if (window.confirm(t("stock.finishConfirm", { product: product.name })))
                      enqueue({ type: "stock.finish", shopId: shop.id, productId: product.id }, t("stock.finished", { product: product.name }));
                  }}
                >
                  {t("stock.actions.finish")}
                </Button>
                <a href={`#/p/${product.id}/sell`} className="inline-flex min-h-12 items-center justify-center rounded-bouton bg-vert-doux px-3 text-center font-bold text-vert-fonce">
                  {t("stock.actions.sell")}
                </a>
                <a href={`#/p/${product.id}/receive`} className="inline-flex min-h-12 items-center justify-center rounded-bouton bg-vert-doux px-3 text-center font-bold text-vert-fonce">
                  {t("stock.actions.receive")}
                </a>
              </div>
              {view.opened ? (
                <Card>
                  <p className="mb-2 text-sm font-semibold text-encre">{t("stock.estimateTitle")}</p>
                  <div className="flex flex-wrap gap-2">
                    {ESTIMATE_CHOICES.map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={view.opened?.remaining === value}
                        onClick={() => enqueue({ type: "stock.estimate", shopId: shop.id, productId: product.id, estimate: value }, t("stock.estimated"))}
                        className={`min-h-11 rounded-full px-4 text-sm font-semibold ${view.opened?.remaining === value ? "bg-vert-principal text-white" : "bg-surface text-encre ring-1 ring-bordure"}`}
                      >
                        {t(`stock.estimates.${estimateKey(value)}`)}
                      </button>
                    ))}
                  </div>
                </Card>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="text-lg font-bold text-encre">{t("stock.reviews.title")}</h2>
            <p className="mt-1 text-sm text-gris-texte">{t("stock.reviews.hint")}</p>
            {reviews.length === 0 ? (
              <p className="mt-3 text-gris-texte">{t("stock.reviews.empty")}</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {reviews.map((r) => (
                  <li key={r.packageId} className="rounded-bouton border border-bordure p-3" data-testid="package-review">
                    <p className="text-sm text-gris-texte">
                      {r.finishedAt ? t("stock.reviews.finishedOn", { date: date(r.finishedAt) }) : null}
                      {r.openedAt && r.finishedAt ? ` · ${t("stock.reviews.duration", { days: Math.max(0, Math.round((new Date(r.finishedAt).getTime() - new Date(r.openedAt).getTime()) / 86_400_000)) })}` : null}
                    </p>
                    <dl className="montant mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <dt className="text-gris-texte">{t("stock.reviews.expected")}</dt>
                      <dd className="text-right font-bold text-encre">{formatAmount(r.expectedRevenue)}</dd>
                      <dt className="text-gris-texte">{t("stock.reviews.accountTakes")}</dt>
                      <dd className="text-right text-encre">{formatAmount(r.accountTakes)}</dd>
                      <dt className="text-gris-texte">{t("stock.reviews.cashSales")}</dt>
                      <dd className="text-right text-encre">{formatAmount(r.estimatedCashSales)}</dd>
                      <dt className="text-gris-texte">{t("stock.reviews.cost")}</dt>
                      <dd className="text-right text-encre">{formatAmount(r.cost)}</dd>
                      <dt className="font-semibold text-encre">{t("stock.reviews.margin")}</dt>
                      <dd className={`text-right font-extrabold ${r.grossMargin >= 0 ? "text-vert-positif" : "text-brique"}`}>{formatAmount(r.grossMargin, { signDisplay: "always" })}</dd>
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="text-lg font-bold text-encre">{t("stock.movements.title")}</h2>
            <ul className="mt-3 flex flex-col divide-y divide-bordure">
              {pendingMoves
                .filter((e) => e.command.type !== "stock.cancel" && e.command.type !== "stock.request")
                .map((e) => (
                  <li key={e.id} className="py-3">
                    <p className="font-semibold text-encre">{t(`stock.kinds.${e.command.type.replace("stock.", "") as "open"}`)}</p>
                    <p className="text-sm text-gris-texte">
                      {date(e.deviceCreatedAt)}
                      <span className="font-semibold text-safran"> · {e.status === "rejected" ? t("sync.rejectedBadge", { reason: t(`errors.${rejectionMessage(e.error)}`) }) : t("stock.pendingShort")}</span>
                    </p>
                  </li>
                ))}
              {movements.map((m) => {
                const isCancelled = cancelled.has(m.id);
                const path =
                  canRecord && m.kind !== "cancellation"
                    ? cancellationPath({
                        role,
                        userId,
                        operation: { kind: "take", authorId: m.authorId, serverCreatedAt: m.serverCreatedAt },
                        alreadyCancelled: isCancelled || requested.has(m.id),
                        now,
                        windowMinutes,
                      })
                    : "none";
                return (
                  <li key={m.id} className="py-3">
                    <p className={`font-semibold text-encre ${isCancelled ? "line-through" : ""}`}>
                      {t(`stock.kinds.${m.kind === "whole_sale" ? "sell" : m.kind === "reception" ? "receive" : m.kind === "adjustment" ? "adjust" : m.kind}`)}
                      {m.quantity ? <span className="font-normal text-gris-texte"> · {m.quantity > 0 ? `+${m.quantity}` : m.quantity}</span> : null}
                      {m.amount ? <span className="montant font-normal text-gris-texte"> · {formatAmount(m.amount)}</span> : null}
                    </p>
                    <p className="text-sm text-gris-texte">
                      {date(m.deviceCreatedAt)}
                      {data.profiles.get(m.authorId) ? ` · ${t("ledger.by", { name: data.profiles.get(m.authorId)! })}` : null}
                      {m.reason ? ` · ${m.reason}` : null}
                    </p>
                    {isCancelled ? <Badge tone="danger">{t("ledger.cancelled")}</Badge> : null}
                    {requested.has(m.id) && !isCancelled ? <Badge tone="warning">{t("ledger.pendingRequestShort")}</Badge> : null}
                    <OperationActions
                      path={path}
                      onCancel={() => enqueue({ type: "stock.cancel", shopId: shop.id, productId: product.id, movementId: m.id, reason: null, fallbackReason: lateReason })}
                      onRequest={(reason) => enqueue({ type: "stock.request", shopId: shop.id, productId: product.id, movementId: m.id, reason })}
                    />
                  </li>
                );
              })}
              {movements.length === 0 && pendingMoves.length === 0 ? <li className="py-3 text-gris-texte">{t("stock.movements.empty")}</li> : null}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Réception, vente de conditionnement entier, inventaire
// ---------------------------------------------------------------------------

type Done = { command: OutboxEntry["command"]; text: string };

function ReceiveScreen({ stock, shopId, onDone }: { stock: ProductStock; shopId: string; onDone: (done: Done) => void }) {
  const t = useTranslations("stock");
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const [count, setCount] = useState("1");
  const [price, setPrice] = useState<number | null>(null);
  const [supplier, setSupplier] = useState("");
  const [error, setError] = useState(false);
  const { product } = stock;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("receive.title")} intro={product.name} back={{ href: `#/p/${product.id}`, label: product.name }} />
      <Card>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            const n = Number(count);
            if (!Number.isInteger(n) || n < 1 || n > 500 || !price) return setError(true);
            onDone({ command: { type: "stock.receive", shopId, productId: product.id, count: n, purchasePrice: price, supplier: supplier.trim() || null }, text: t("received", { count: n, label: product.packageLabel }) });
          }}
        >
          {error ? <Notice tone="danger">{te("invalidInput")}</Notice> : null}
          <TextField label={t("receive.count", { label: product.packageLabel })} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))} />
          <AmountInput label={t("receive.purchasePrice", { label: product.packageLabel })} name="purchasePrice" size="md" onValueChange={setPrice} />
          <TextField label={`${t("receive.supplier")} (${tc("optional")})`} value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          <Button type="submit" variant="primary" block>
            {t("receive.submit")}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function SellScreen({ stock, data, shopId, onDone }: { stock: ProductStock; data: LocalShopData; shopId: string; onDone: (done: Done) => void }) {
  const t = useTranslations("stock");
  const te = useTranslations("errors");
  const { product, view } = stock;
  const [price, setPrice] = useState<number | null>(product.packagePrice);
  const [mode, setMode] = useState<"cash" | "account">("cash");
  const [customerId, setCustomerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const summaries = summarizeByCustomer(data.operations, data.outbox);
  const customers = data.customers.filter((c) => !c.archived).sort((a, b) => a.fullName.localeCompare(b.fullName, "fr"));
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("sell.title")} intro={product.name} back={{ href: `#/p/${product.id}`, label: product.name }} />
      <Card>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (view.closed === 0) return setError(te("noClosedPackage"));
            if (!price) return setError(te("amountRequired"));
            if (mode === "account" && !customerId) return setError(te("invalidInput"));
            onDone({
              command: { type: "stock.sell", shopId, productId: product.id, price, customerId: mode === "account" ? customerId : null, takeId: mode === "account" ? crypto.randomUUID() : null },
              text: t("sold", { label: product.packageLabel, price: formatAmount(price) }),
            });
          }}
        >
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <AmountInput label={t("sell.price", { label: product.packageLabel })} name="price" size="md" defaultValue={product.packagePrice} onValueChange={setPrice} />
          <div onChange={(e) => setMode((e.target as HTMLInputElement).value as "cash" | "account")}>
            <ChoiceGroup legend={t("sell.mode")} name="sellMode" type="radio" defaultValues={[mode]} options={(["cash", "account"] as const).map((value) => ({ value, label: t(`sell.${value}`) }))} />
          </div>
          {mode === "account" ? (
            <label className="flex flex-col">
              <span className="mb-1.5 text-sm font-semibold text-encre">{t("sell.customer")}</span>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="h-13 rounded-bouton border border-bordure-champ bg-surface px-3 text-base">
                <option value="">{t("sell.chooseCustomer")}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {[c.fullName, formatAmount(summaries.get(c.id)?.balance ?? 0, { signDisplay: "always" })].join(" · ")}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Button type="submit" variant="primary" block>
            {t("sell.submit")}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function InventoryScreen({
  stocks,
  canRecord,
  shopId,
  onDone,
  enqueue,
}: {
  stocks: ProductStock[];
  canRecord: boolean;
  shopId: string;
  onDone: (message: string) => void;
  enqueue: (command: OutboxEntry["command"]) => void;
}) {
  const t = useTranslations("stock");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [estimates, setEstimates] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  if (!canRecord) return null;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("inventory.title")} intro={t("inventory.intro")} back={{ href: "#/", label: t("title") }} />
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          let changes = 0;
          for (const s of stocks) {
            const raw = counts[s.product.id];
            if (raw !== undefined && raw !== "") {
              const delta = inventoryDelta(Number(raw), s.view.closed);
              if (delta !== 0) {
                enqueue({ type: "stock.adjust", shopId, productId: s.product.id, delta, reason: reason.trim() || t("inventory.defaultReason"), purchasePrice: null });
                changes++;
              }
            }
            const estimate = estimates[s.product.id];
            if (estimate !== undefined && s.view.opened && estimate !== s.view.opened.remaining) {
              enqueue({ type: "stock.estimate", shopId, productId: s.product.id, estimate });
              changes++;
            }
          }
          onDone(t("inventory.done", { count: changes }));
        }}
      >
        {stocks.map((s) => {
          const raw = counts[s.product.id];
          const delta = raw !== undefined && raw !== "" ? inventoryDelta(Number(raw), s.view.closed) : 0;
          return (
            <Card key={s.product.id}>
              <p className="font-bold text-encre">{s.product.name}</p>
              <p className="text-sm text-gris-texte">{t("inventory.theoretical", { count: s.view.closed, label: s.product.packageLabel })}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <TextField
                  label={t("inventory.counted", { label: s.product.packageLabel })}
                  inputMode="numeric"
                  value={raw ?? ""}
                  placeholder={String(s.view.closed)}
                  onChange={(e) => setCounts((c) => ({ ...c, [s.product.id]: e.target.value.replace(/\D/g, "") }))}
                />
                {s.view.opened ? (
                  <label className="flex flex-col">
                    <span className="mb-1.5 text-sm font-semibold text-encre">{t("inventory.remaining")}</span>
                    <select
                      value={estimates[s.product.id] ?? s.view.opened.remaining ?? ""}
                      onChange={(e) => setEstimates((x) => ({ ...x, [s.product.id]: Number(e.target.value) }))}
                      className="h-13 rounded-bouton border border-bordure-champ bg-surface px-3 text-base"
                    >
                      {ESTIMATE_CHOICES.map((value) => (
                        <option key={value} value={value}>
                          {t(`estimates.${estimateKey(value)}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              {delta !== 0 ? <p className={`mt-2 text-sm font-semibold ${delta < 0 ? "text-brique" : "text-vert-positif"}`}>{t("inventory.delta", { delta: delta > 0 ? `+${delta}` : String(delta) })}</p> : null}
            </Card>
          );
        })}
        <TextField label={t("inventory.reason")} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("inventory.defaultReason")} />
        <Button type="submit" variant="primary" block>
          {t("inventory.submit")}
        </Button>
      </form>
    </div>
  );
}
