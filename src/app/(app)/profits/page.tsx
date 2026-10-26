import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { resolvePeriod, type PeriodChoice } from "@/modules/reporting";
import { getProfitReport } from "@/modules/reporting/server";
import { formatAmount, localDate } from "@/shared/domain";
import { Card, PageHeader } from "@/shared/ui";
import { NoShop, requireShopPage } from "../_shell/shop";

type Params = { period?: string; from?: string; to?: string };

/** Bénéfices (RG8) : bénéfice brut par période et par produit, à côté de l'argent encaissé. Propriétaire et comptable. */
export default async function ProfitsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { shop } = await requireShopPage("viewProfits");
  if (!shop) return <NoShop />;
  const t = await getTranslations("profits");
  const format = await getFormatter();
  const today = localDate(new Date(), shop.timezone);
  const { choice, period } = resolvePeriod(await searchParams, today);
  const report = await getProfitReport(shop, period);
  const { profit, cash } = report;
  const day = (d: string) => format.dateTime(new Date(`${d}T12:00:00Z`), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const signed = (v: number) => formatAmount(v, { signDisplay: v < 0 ? "always" : "auto" });

  const choices: { key: Exclude<PeriodChoice, "custom">; href: string }[] = [
    { key: "current", href: "/profits" },
    { key: "previous", href: "/profits?period=previous" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} intro={t("periodLabel", { from: day(period.from), to: day(period.to) })} />

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <nav aria-label={t("choosePeriod")} className="flex flex-wrap gap-2">
            {choices.map((c) => (
              <Link
                key={c.key}
                href={c.href}
                aria-current={choice === c.key ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold ${choice === c.key ? "bg-vert-principal text-white" : "bg-vert-doux text-vert-fonce"}`}
              >
                {t(`periods.${c.key}`)}
              </Link>
            ))}
          </nav>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="period" value="custom" />
            <label className="flex flex-col text-sm font-semibold text-encre">
              {t("from")}
              <input type="date" name="from" defaultValue={period.from} max={today} required className="mt-1 min-h-11 rounded-bouton border border-bordure-champ px-3" />
            </label>
            <label className="flex flex-col text-sm font-semibold text-encre">
              {t("to")}
              <input type="date" name="to" defaultValue={period.to} max={today} required className="mt-1 min-h-11 rounded-bouton border border-bordure-champ px-3" />
            </label>
            <button type="submit" className={`min-h-11 rounded-bouton px-4 text-sm font-bold ${choice === "custom" ? "bg-vert-principal text-white" : "bg-vert-doux text-vert-fonce"}`}>
              {t("apply")}
            </button>
          </form>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-carte bg-vert-principal p-6 text-white">
          <h2 className="text-base font-semibold text-white/85">{t("grossProfit")}</h2>
          <p className="montant mt-1 text-4xl font-extrabold" data-testid="gross-profit">
            {signed(profit.total)}
          </p>
          <p className="mt-2 text-sm text-white/85">{t("profitDetail", { reviews: formatAmount(profit.reviewsMargin), whole: formatAmount(profit.wholeSalesMargin) })}</p>
        </section>
        <section className="rounded-carte border border-bordure bg-surface p-6">
          <h2 className="text-base font-semibold text-gris-texte">{t("collected")}</h2>
          <p className="montant mt-1 text-4xl font-extrabold text-vert-positif" data-testid="cash-collected">
            {formatAmount(cash.collected)}
          </p>
          <p className="mt-2 text-sm text-gris-texte">{t("closedDays", { closed: cash.closedDays, days: cash.days })}</p>
        </section>
      </div>
      <p className="rounded-carte bg-safran-doux px-5 py-4 text-sm text-encre">{t("explain", { takes: formatAmount(cash.accountTakes) })}</p>

      <Card>
        <h2 className="mb-3 text-lg font-bold text-encre">{t("byProduct")}</h2>
        {profit.byProduct.length === 0 ? (
          <p className="text-gris-texte">{t("noProfit")}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-bordure text-gris-texte">
                  <th scope="col" className="px-5 py-2 font-semibold">
                    {t("columns.product")}
                  </th>
                  <th scope="col" className="hidden px-2 py-2 text-right font-semibold sm:table-cell">
                    {t("columns.finished")}
                  </th>
                  <th scope="col" className="hidden px-2 py-2 text-right font-semibold sm:table-cell">
                    {t("columns.whole")}
                  </th>
                  <th scope="col" className="px-5 py-2 text-right font-semibold">
                    {t("columns.margin")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bordure">
                {profit.byProduct.map((row) => (
                  <tr key={row.productId}>
                    <th scope="row" className="px-5 py-3 font-bold text-encre">
                      {report.productNames[row.productId] ?? t("unknownProduct")}
                      <span className="block text-xs font-normal text-gris-texte sm:hidden">{t("rowDetail", { finished: row.packagesFinished, whole: row.wholeSold })}</span>
                    </th>
                    <td className="montant hidden px-2 py-3 text-right sm:table-cell">{row.packagesFinished}</td>
                    <td className="montant hidden px-2 py-3 text-right sm:table-cell">{row.wholeSold}</td>
                    <td className={`montant px-5 py-3 text-right font-extrabold ${row.margin < 0 ? "text-brique" : "text-vert-positif"}`}>{signed(row.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-gris-texte">{t("approximation")}</p>
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-bold text-encre">{t("controlTitle")}</h2>
        <p className="mb-3 text-sm text-gris-texte">{t("controlHint")}</p>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-bouton bg-fond px-4 py-3">
            <dt className="text-sm text-gris-texte">{t("expectedCounter")}</dt>
            <dd className="montant text-2xl font-extrabold text-encre">{formatAmount(cash.counterCashExpected)}</dd>
          </div>
          <div className="rounded-bouton bg-fond px-4 py-3">
            <dt className="text-sm text-gris-texte">{t("declaredCounter")}</dt>
            <dd className="montant text-2xl font-extrabold text-encre">{signed(cash.counterCashDeclared)}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
