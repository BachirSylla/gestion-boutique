"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { summarizeByCustomer, useLocalShop } from "@/modules/sync";
import { formatAmount } from "@/shared/domain";
import { shopTotals } from "../domain/customers";

/**
 * Accueil : ce que les clients doivent, avances détenues et gros boutons de saisie.
 * Calculé sur l'appareil (journal local + saisies en attente) : juste même hors ligne.
 */
export function HomeSummary({ shopId, canRecord }: { shopId: string; canRecord: boolean }) {
  const t = useTranslations("home");
  const data = useLocalShop(shopId);
  const summaries = data ? summarizeByCustomer(data.operations, data.outbox) : new Map();
  const live = (data?.customers ?? []).filter((c) => !c.archived).map((c) => ({ balance: summaries.get(c.id)?.balance ?? 0 }));
  const totals = shopTotals(live);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <section className="rounded-carte bg-vert-principal p-6 text-white" aria-busy={!data}>
        <h2 className="text-base font-semibold text-white/85">{t("owedTitle")}</h2>
        <p className="montant mt-1 text-4xl font-extrabold sm:text-5xl" data-testid="owed-total">
          {formatAmount(totals.owedByCustomers)}
        </p>
        <p className="mt-2 text-sm text-white/85">
          {t("owedCount", { count: totals.customersInDebt })}
          <span> · </span>
          {t("advancesHeld", { amount: formatAmount(totals.advancesHeld) })}
        </p>
      </section>
      {canRecord ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <Link href="/customers#/pick/take" className="flex min-h-20 items-center justify-center rounded-carte bg-safran px-4 text-center text-lg font-extrabold text-encre hover:brightness-95">
            {t("newTake")}
          </Link>
          <Link
            href="/customers#/pick/payment"
            className="flex min-h-20 items-center justify-center rounded-carte bg-surface px-4 text-center text-lg font-extrabold text-vert-principal ring-2 ring-vert-principal hover:bg-vert-doux"
          >
            {t("newPayment")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
