"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useLocalShop } from "@/modules/sync";
import { Badge } from "@/shared/ui";
import { needsReorder, ruptureEstimate } from "../domain/stock";
import { useProductStocks } from "./useProductStocks";

/** Accueil : produits à racheter (fermés au seuil ou en dessous), avec la rupture estimée. Lu sur l'appareil. */
export function StockWatch({ shopId, limit = 5 }: { shopId: string; limit?: number }) {
  const t = useTranslations("stock");
  const format = useFormatter();
  const data = useLocalShop(shopId);
  const stocks = useProductStocks(data);
  const now = new Date();
  const watched = stocks
    .filter((s) => needsReorder(s.view.closed, s.product.reorderThreshold))
    .map((s) => ({ ...s, rupture: ruptureEstimate(s.view, s.durations, now) }))
    .sort((a, b) => (a.rupture?.days ?? Infinity) - (b.rupture?.days ?? Infinity) || a.view.closed - b.view.closed);

  return (
    <section className="rounded-carte border border-bordure bg-surface p-5" aria-busy={!data} data-testid="stock-watch">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-bold text-encre">{t("watchTitle")}</h2>
        <Link href="/stock" className="min-h-11 content-center text-sm font-semibold text-vert-fonce hover:underline">
          {t("seeStock")}
        </Link>
      </div>
      {watched.length === 0 ? (
        <p className="text-gris-texte">{data ? t("watchEmpty") : t("loading")}</p>
      ) : (
        <ul className="-mx-5 divide-y divide-bordure">
          {watched.slice(0, limit).map((s) => (
            <li key={s.product.id}>
              <a href={`/stock#/p/${s.product.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-fond">
                <span>
                  <span className="block font-bold text-encre">{s.product.name}</span>
                  <span className="block text-sm text-gris-texte">
                    {t("closedCount", { count: s.view.closed, label: s.product.packageLabel })}
                    {s.rupture ? (
                      <>
                        <span> · </span>
                        {t("ruptureShort", { date: format.dateTime(s.rupture.date, { day: "numeric", month: "short" }) })}
                      </>
                    ) : null}
                  </span>
                </span>
                <span className="shrink-0 whitespace-nowrap">
                  <Badge tone="warning">{t("filters.reorder")}</Badge>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
