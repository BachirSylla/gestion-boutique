"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useOptionalSync, type LocalShopData } from "@/modules/sync";
import { daysBetween, formatAmount, localDate } from "@/shared/domain";
import { AmountInput, Badge, Button, Card, Notice, PageHeader, TextField } from "@/shared/ui";
import { counterCashSales, latestClosings } from "../domain/cash";
import { DaySalesBadge, DaySalesBreakdown } from "./DaySalesCard";
import { closingRecords } from "./local-flows";
import { cashDay, useCashDay } from "./useCashDay";

export interface CashAppProps {
  shop: { id: string; name: string; timezone: string };
  canRecord: boolean;
}

function previousDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** Caisse (RG7) : ventes du jour et clôture du soir, lues et saisies sur l'appareil (hors ligne). */
export function CashApp({ shop, canRecord }: CashAppProps) {
  const t = useTranslations("cash");
  const format = useFormatter();
  const engine = useOptionalSync()?.engine;
  const today = localDate(new Date(), shop.timezone);
  const [date, setDate] = useState(today);
  const day = useCashDay(shop.id, shop.timezone, date);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void engine?.sync();
  }, [engine]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!day || !engine) return <p className="text-gris-texte">{t("loading")}</p>;
  const dateLabel = (d: string) => format.dateTime(new Date(`${d}T12:00:00Z`), { day: "numeric", month: "short", weekday: "long", timeZone: "UTC" });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title={t("title")} intro={t("intro")} />
      {notice ? <Notice tone="positive">{notice}</Notice> : null}

      <div className="flex gap-2" role="group" aria-label={t("chooseDay")}>
        {[today, previousDay(today)].map((d, i) => (
          <button
            key={d}
            type="button"
            aria-pressed={date === d}
            onClick={() => setDate(d)}
            className={`min-h-11 rounded-full px-4 text-sm font-bold ${date === d ? "bg-vert-principal text-white" : "bg-vert-doux text-vert-fonce"}`}
          >
            {i === 0 ? t("today") : t("yesterday")}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <div className="mb-1 flex items-start justify-between gap-2">
            <h2 className="text-lg font-bold text-encre">{t("daySalesOf", { date: dateLabel(date) })}</h2>
            <DaySalesBadge sales={day.sales} />
          </div>
          <p className="montant mb-3 text-4xl font-extrabold text-encre" data-testid="cash-day-total">
            {day.sales.basis === "estimated" ? t("approx", { amount: formatAmount(day.sales.total) }) : formatAmount(day.sales.total)}
          </p>
          <DaySalesBreakdown sales={day.sales} />
          <p className="mt-3 text-sm text-gris-texte">{day.sales.basis === "closed" ? t("formula") : t("estimateHint")}</p>
        </Card>

        {canRecord ? (
          <ClosingForm
            key={`${date}:${day.closing?.id ?? ""}`}
            data={day.data}
            date={date}
            timeZone={shop.timezone}
            dateLabel={dateLabel(date)}
            onSave={(amounts, note) => {
              void engine.enqueue({ type: "cash.close", shopId: shop.id, businessDate: date, amounts, note });
              setNotice(t("saved"));
              window.scrollTo({ top: 0 });
            }}
          />
        ) : null}
      </div>

      <ClosingHistory data={day.data} today={today} timeZone={shop.timezone} dateLabel={dateLabel} />
    </div>
  );
}

function ClosingForm({
  data,
  date,
  timeZone,
  dateLabel,
  onSave,
}: {
  data: LocalShopData;
  date: string;
  timeZone: string;
  dateLabel: string;
  onSave: (amounts: { paymentMethodId: string; amount: number }[], note: string | null) => void;
}) {
  const t = useTranslations();
  const day = cashDay(data, date, timeZone);
  const methods = (data.shop?.paymentMethods ?? []).filter((m) => m.active || day.closing?.amounts.some((a) => a.paymentMethodId === m.id && a.amount > 0));
  const initial = Object.fromEntries(methods.map((m) => [m.id, day.closing?.amounts.find((a) => a.paymentMethodId === m.id)?.amount ?? null]));
  const [values, setValues] = useState<Record<string, number | null>>(initial);
  const [note, setNote] = useState("");
  const label = (m: (typeof methods)[number]) => (m.kind === "custom" ? (m.label ?? "") : t(`ledger.methods.${m.kind}`));

  const received = Object.values(values).reduce<number>((s, v) => s + (v ?? 0), 0);
  const counter = counterCashSales(received, day.flows);
  const touched = Object.values(values).some((v) => v !== null);

  return (
    <Card>
      <h2 className="text-lg font-bold text-encre">{t("cash.closingOf", { date: dateLabel })}</h2>
      <p className="mt-1 mb-4 text-sm text-gris-texte">{t("cash.closingHint")}</p>
      {day.closing ? (
        <div className="mb-4">
          <Notice tone="neutral">{t("cash.replaces", { amount: formatAmount(day.closing.totalReceived) })}</Notice>
        </div>
      ) : null}
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!touched) return;
          onSave(
            methods.map((m) => ({ paymentMethodId: m.id, amount: values[m.id] ?? 0 })),
            note.trim() || null,
          );
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {methods.map((m, i) => (
            <div key={m.id}>
              <AmountInput
                label={label(m)}
                name={`method-${m.id}`}
                size="md"
                autoFocus={i === 0}
                defaultValue={initial[m.id]}
                onValueChange={(v) => setValues((prev) => ({ ...prev, [m.id]: v }))}
              />
              {day.flows.paymentsByMethod.get(m.id) ? (
                <p className="mt-1 text-xs text-gris-texte">{t("cash.includesPayments", { amount: formatAmount(day.flows.paymentsByMethod.get(m.id)!) })}</p>
              ) : null}
            </div>
          ))}
        </div>

        <dl className="flex flex-col gap-1.5 rounded-bouton bg-fond px-4 py-3 text-sm" aria-live="polite">
          <div className="flex justify-between gap-3">
            <dt className="text-gris-texte">{t("cash.received")}</dt>
            <dd className="montant font-bold">{formatAmount(received)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-gris-texte">{t("cash.minusPayments")}</dt>
            <dd className="montant font-bold">{formatAmount(-day.flows.payments, { signDisplay: "always" })}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-gris-texte">{t("cash.minusWholeSales")}</dt>
            <dd className="montant font-bold">{formatAmount(-day.flows.wholeSalesCash, { signDisplay: "always" })}</dd>
          </div>
          <div className="mt-1 flex justify-between gap-3 border-t border-bordure pt-2 text-base">
            <dt className="font-bold text-encre">{t("cash.counterCash")}</dt>
            <dd className={`montant font-extrabold ${counter < 0 ? "text-brique" : "text-vert-positif"}`} data-testid="closing-counter-cash">
              {formatAmount(counter)}
            </dd>
          </div>
        </dl>
        {touched && counter < 0 ? <Notice tone="danger">{t("cash.negative")}</Notice> : null}

        <TextField label={t("cash.note")} name="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        <Button type="submit" block disabled={!touched}>
          {t("cash.save")}
        </Button>
      </form>
    </Card>
  );
}

function ClosingHistory({ data, today, timeZone, dateLabel }: { data: LocalShopData; today: string; timeZone: string; dateLabel: (d: string) => string }) {
  const t = useTranslations("cash");
  const records = closingRecords(data).filter((r) => daysBetween(r.businessDate, today) <= 31);
  const latest = [...latestClosings(records).values()].sort((a, b) => b.businessDate.localeCompare(a.businessDate));
  return (
    <Card>
      <h2 className="mb-2 text-lg font-bold text-encre">{t("history")}</h2>
      {latest.length === 0 ? (
        <p className="text-gris-texte">{t("noHistory")}</p>
      ) : (
        <ul className="-mx-5 divide-y divide-bordure">
          {latest.map((closing) => {
            const day = cashDay(data, closing.businessDate, timeZone);
            const count = records.filter((r) => r.businessDate === closing.businessDate).length;
            const pending = records.find((r) => r.id === closing.id)?.pending;
            return (
              <li key={closing.businessDate} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3">
                <div>
                  <p className="font-bold text-encre first-letter:uppercase">{dateLabel(closing.businessDate)}</p>
                  <p className="text-sm text-gris-texte">{t("receivedShort", { amount: formatAmount(closing.totalReceived) })}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`montant font-extrabold ${day.sales.counterCash !== null && day.sales.counterCash < 0 ? "text-brique" : "text-encre"}`}>
                    {t("counterShort", { amount: formatAmount(day.sales.counterCash ?? 0) })}
                  </span>
                  <span className="flex gap-1">
                    {count > 1 ? <Badge>{t("corrected")}</Badge> : null}
                    {pending ? <Badge tone="warning">{t("pendingSend")}</Badge> : null}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
