import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatAmount } from "@/shared/domain";

/** Indicateur « Bénéfice brut du mois » (propriétaire, comptable) à côté de l'argent encaissé (RG8). Calculé sur le serveur. */
export async function MonthProfitCard({ profit, collected }: { profit: number; collected: number }) {
  const t = await getTranslations("dashboard");
  return (
    <section className="flex flex-col gap-3 rounded-carte border border-bordure bg-surface p-5" data-testid="month-profit">
      <h2 className="text-base font-bold text-encre">{t("monthProfit")}</h2>
      <p className={`montant text-3xl font-extrabold ${profit < 0 ? "text-brique" : "text-vert-positif"}`}>{formatAmount(profit, { signDisplay: profit < 0 ? "always" : "auto" })}</p>
      <p className="text-sm text-gris-texte">{t("monthCollected", { amount: formatAmount(collected) })}</p>
      <Link href="/profits" className="inline-flex min-h-11 items-center text-sm font-bold text-vert-fonce hover:underline">
        {t("seeProfits")}
      </Link>
    </section>
  );
}
