"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatAmount } from "@/shared/domain";
import { Badge } from "@/shared/ui";
import type { DaySales } from "../domain/cash";
import { useCashDay } from "./useCashDay";

/** Détail des ventes d'une journée : prises à compte + sacs entiers au comptant + comptant au détail (RG7). */
export function DaySalesBreakdown({ sales }: { sales: DaySales }) {
  const t = useTranslations("cash");
  const rows: [string, number | null][] = [
    [t("accountTakes"), sales.accountTakes],
    [t("wholeSalesCash"), sales.wholeSalesCash],
    [sales.basis === "closed" ? t("counterCashClosed") : t("counterCashEstimated"), sales.counterCash],
  ];
  return (
    <dl className="flex flex-col gap-1.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-3">
          <dt className="text-gris-texte">{label}</dt>
          <dd className={`montant font-bold ${value !== null && value < 0 ? "text-brique" : "text-encre"}`}>{value === null ? t("unknown") : formatAmount(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DaySalesBadge({ sales }: { sales: DaySales }) {
  const t = useTranslations("cash");
  return (
    <span className="shrink-0 whitespace-nowrap">
      {sales.basis === "closed" ? <Badge tone="positive">{t("basis.closed")}</Badge> : <Badge tone="warning">{sales.basis === "estimated" ? t("basis.estimated") : t("basis.unknown")}</Badge>}
    </span>
  );
}

/** Carte « Ventes du jour » (accueil) : calculée sur l'appareil, juste hors ligne. */
export function DaySalesCard({ shopId, timeZone, canClose }: { shopId: string; timeZone: string; canClose: boolean }) {
  const t = useTranslations("cash");
  const day = useCashDay(shopId, timeZone);
  return (
    <section className="flex flex-col gap-3 rounded-carte border border-bordure bg-surface p-5" aria-busy={!day} data-testid="day-sales">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-encre">{t("daySales")}</h2>
        {day ? <DaySalesBadge sales={day.sales} /> : null}
      </div>
      <p className="montant text-3xl font-extrabold text-encre" data-testid="day-sales-total">
        {day ? (day.sales.basis === "estimated" ? t("approx", { amount: formatAmount(day.sales.total) }) : formatAmount(day.sales.total)) : "—"}
      </p>
      {day ? <DaySalesBreakdown sales={day.sales} /> : null}
      {canClose && day && day.sales.basis !== "closed" ? (
        <Link href="/cash" className="inline-flex min-h-11 items-center text-sm font-bold text-vert-fonce hover:underline">
          {t("closeNow")}
        </Link>
      ) : null}
    </section>
  );
}
