"use client";

import { useFormatter, useTranslations } from "next-intl";
import { mergeOperations, useLocalShop } from "@/modules/sync";
import { formatAmount } from "@/shared/domain";
import { Badge } from "@/shared/ui";

interface ActivityRow {
  id: string;
  at: string;
  title: string;
  subject: string;
  amount: number | null;
  tone: "positive" | "negative" | "neutral";
  author: string;
  pending: boolean;
  href: string;
}

/** Dernières opérations de la boutique (journal client, stock, clôtures), saisies en attente comprises. */
export function RecentActivity({ shopId, timeZone, limit = 8 }: { shopId: string; timeZone: string; limit?: number }) {
  const t = useTranslations();
  const format = useFormatter();
  const data = useLocalShop(shopId);
  if (!data) return null;

  const customers = new Map(data.customers.map((c) => [c.id, c.fullName]));
  const products = new Map(data.products.map((p) => [p.id, p.name]));
  const customerOf = new Map(data.operations.map((o) => [o.id, o.customerId]));
  for (const e of data.outbox) if ("customerId" in e.command && e.command.customerId) customerOf.set(e.id, e.command.customerId);
  const author = (id: string) => (data.profiles.get(id) ?? "").split(" ")[0] ?? "";

  const rows: ActivityRow[] = [
    ...mergeOperations(data.operations, data.outbox)
      .filter((op) => !op.rejected)
      .map((op) => {
        const customerId = customerOf.get(op.id) ?? "";
        return {
          id: op.id,
          at: op.deviceCreatedAt,
          title: t(`ledger.kinds.${op.kind}`),
          subject: customers.get(customerId) ?? "",
          amount: op.amount,
          tone: op.kind === "payment" ? "positive" : op.kind === "take" ? "negative" : "neutral",
          author: author(op.authorId),
          pending: op.pending,
          href: `/customers#/c/${customerId}`,
        } satisfies ActivityRow;
      }),
    ...data.movements
      .filter((m) => m.kind !== "estimate")
      .map(
        (m): ActivityRow => ({
          id: m.id,
          at: m.deviceCreatedAt,
          title: t(`stock.kinds.${m.kind}`),
          subject: products.get(m.productId) ?? "",
          amount: m.kind === "whole_sale" ? m.amount : null,
          tone: "neutral",
          author: author(m.authorId),
          pending: false,
          href: `/stock#/p/${m.productId}`,
        }),
      ),
    ...data.closings.map(
      (c): ActivityRow => ({
        id: c.id,
        at: c.deviceCreatedAt,
        title: t("cash.closingOf", { date: format.dateTime(new Date(`${c.businessDate}T12:00:00Z`), { day: "numeric", month: "short", timeZone: "UTC" }) }),
        subject: t("cash.receivedShort", { amount: formatAmount(c.totalReceived) }),
        amount: null,
        tone: "neutral",
        author: author(c.authorId),
        pending: false,
        href: "/cash",
      }),
    ),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);

  return (
    <section className="rounded-carte border border-bordure bg-surface p-5" data-testid="recent-activity">
      <h2 className="mb-2 text-lg font-bold text-encre">{t("dashboard.recentTitle")}</h2>
      {rows.length === 0 ? (
        <p className="text-gris-texte">{t("dashboard.recentEmpty")}</p>
      ) : (
        <ul className="-mx-5 divide-y divide-bordure">
          {rows.map((row) => (
            <li key={row.id}>
              <a href={row.href} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-fond">
                <span className="min-w-0">
                  <span className="block truncate font-bold text-encre">
                    {row.title}
                    {row.subject ? <span className="font-normal text-gris-texte"> · {row.subject}</span> : null}
                  </span>
                  <span className="block text-sm text-gris-texte">
                    {format.dateTime(new Date(row.at), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone })}
                    {row.author ? <span> · {row.author}</span> : null}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  {row.amount !== null ? (
                    <span className={`montant font-extrabold ${row.tone === "positive" ? "text-vert-positif" : row.tone === "negative" ? "text-brique" : "text-encre"}`}>
                      {formatAmount(row.tone === "negative" ? -row.amount : row.amount, { signDisplay: row.tone === "neutral" ? "auto" : "always" })}
                    </span>
                  ) : null}
                  {row.pending ? <Badge tone="warning">{t("cash.pendingSend")}</Badge> : null}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
