"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { formatAmount, formatPhone, formatQuantity, localDate, whatsAppLink } from "@/shared/domain";
import { Button, ChoiceGroup, Notice, TextField } from "@/shared/ui";
import {
  currentMonthPeriod,
  nextDueDate,
  previousMonthPeriod,
  receiptData,
  receiptFileName,
  statementData,
  statementFileName,
  type DocLine,
  type DocOperation,
} from "../domain/documents";
import { renderReceiptPng, renderStatementPdf, shareOrDownload } from "./render";

export interface DocShop {
  name: string;
  district: string | null;
  city: string | null;
  phone: string | null;
  timezone: string;
}

export interface DocCustomer {
  fullName: string;
  phone: string | null;
  type: "advance" | "monthly" | "free";
  /** Jour d'échéance effectif d'un client mensuel (null = fin de mois). */
  dueDay: number | null;
}

function useDocTexts() {
  const t = useTranslations();
  const format = useFormatter();
  const shopDetails = (shop: DocShop) => [[shop.district, shop.city].filter(Boolean).join(", "), shop.phone ? formatPhone(shop.phone) : null].filter(Boolean).join(" · ");
  const balanceText = (balance: number) =>
    balance < 0 ? t("documents.youOwe", { amount: formatAmount(-balance) }) : balance > 0 ? t("documents.advanceLeft", { amount: formatAmount(balance) }) : t("documents.settled");
  const lineText = (line: DocLine) =>
    line.formatCount ? t("documents.formatLine", { count: line.formatCount, label: line.label }) : `${line.label} · ${formatQuantity(line.quantityMilli)} ${t(`ledger.units.${line.unit as "kg"}`)} × ${formatAmount(line.unitPrice)}`;
  const dateTime = (iso: string, timeZone: string) => format.dateTime(new Date(iso), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone });
  const day = (date: string) => format.dateTime(new Date(`${date}T12:00:00Z`), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return { t, format, shopDetails, balanceText, lineText, dateTime, day };
}

/** Reçu d'une prise ou d'un versement : image au format téléphone, partagée ou téléchargée. */
export function ReceiptButton({
  operation,
  operations,
  customer,
  shop,
  variant = "ghost",
  label,
}: {
  operation: DocOperation;
  operations: DocOperation[];
  customer: DocCustomer;
  shop: DocShop;
  variant?: "ghost" | "secondary" | "accent";
  label?: string;
}) {
  const { t, shopDetails, balanceText, lineText, dateTime, day } = useDocTexts();
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      const data = receiptData(operation, operations);
      const today = localDate(new Date(), shop.timezone);
      const blob = await renderReceiptPng({
        shopName: shop.name,
        shopDetails: shopDetails(shop),
        title: data.kind === "take" ? t("documents.receiptTake") : t("documents.receiptPayment"),
        dateLine: dateTime(data.at, shop.timezone),
        customerLine: customer.fullName,
        lines: data.kind === "take" ? data.lines.map((l) => ({ left: lineText(l), right: formatAmount(l.lineAmount) })) : data.paymentMethodLabel ? [{ left: t("documents.method"), right: data.paymentMethodLabel }] : [],
        note: data.note,
        totalLabel: data.kind === "take" ? t("documents.totalTaken") : t("documents.totalPaid"),
        total: formatAmount(data.total),
        balances: [
          { label: t("documents.balanceBefore"), value: balanceText(data.balanceBefore), tone: "neutral" },
          { label: t("documents.balanceAfter"), value: balanceText(data.balanceAfter), tone: data.balanceAfter < 0 ? "debt" : data.balanceAfter > 0 ? "advance" : "neutral" },
        ],
        dueLine: customer.type === "monthly" ? t("documents.dueDate", { date: day(nextDueDate(today, customer.dueDay)) }) : null,
        footerLines: [t("documents.servedBy", { name: data.authorFirstName || "—" }), t("documents.operationNumber", { number: data.operationNumber })],
      });
      await shareOrDownload(blob, receiptFileName(customer.fullName, data.at, shop.timezone, "png"), t("documents.receiptTitle", { name: customer.fullName }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={variant} className={variant === "ghost" ? "min-h-11 px-3 text-sm" : ""} disabled={busy} onClick={() => void send()}>
      {busy ? t("documents.preparing") : (label ?? t("documents.receipt"))}
    </Button>
  );
}

/** Relevé de compte (PDF A4) sur une période : ce mois, le mois dernier ou des dates choisies. */
export function StatementPanel({ operations, customer, shop }: { operations: DocOperation[]; customer: DocCustomer; shop: DocShop }) {
  const { t, shopDetails, lineText, dateTime, day } = useDocTexts();
  const today = localDate(new Date(), shop.timezone);
  const [choice, setChoice] = useState<"current" | "previous" | "custom">("current");
  const [custom, setCustom] = useState(currentMonthPeriod(today));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const period = choice === "current" ? currentMonthPeriod(today) : choice === "previous" ? previousMonthPeriod(today) : custom;
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(period.from) && /^\d{4}-\d{2}-\d{2}$/.test(period.to) && period.from <= period.to;

  async function generate() {
    if (!valid) return;
    setBusy(true);
    try {
      const s = statementData(operations, period.from, period.to, shop.timezone);
      const signedAmount = (value: number) => formatAmount(value, { signDisplay: "always" });
      const blob = await renderStatementPdf({
        shopName: shop.name,
        shopDetails: shopDetails(shop),
        title: t("documents.statementTitle"),
        customerLines: [
          `${customer.fullName}${customer.phone ? ` · ${formatPhone(customer.phone)}` : ""}`,
          `${t(`customers.types.${customer.type}`)}${customer.type === "monthly" ? ` · ${t("documents.dueDate", { date: day(nextDueDate(today, customer.dueDay)) })}` : ""}`,
        ],
        periodLine: t("documents.period", { from: day(period.from), to: day(period.to) }),
        summary: [
          { label: t("documents.carried"), value: signedAmount(s.carriedBalance) },
          { label: t("documents.totalTakenPeriod"), value: formatAmount(s.totalTaken) },
          { label: t("documents.totalPaidPeriod"), value: formatAmount(s.totalPaid) },
          { label: t("documents.amountDue"), value: formatAmount(s.amountDue), strong: true },
        ],
        columns: [t("documents.columns.date"), t("documents.columns.detail"), t("documents.columns.taken"), t("documents.columns.paid"), t("documents.columns.balance")],
        rows: s.rows.map((r) => ({
          date: dateTime(r.at, shop.timezone),
          detail:
            r.kind === "take"
              ? [...(r.operation.lines.length ? r.operation.lines.map(lineText) : [t("ledger.kinds.take")]), ...(r.operation.note ? [r.operation.note] : [])].concat(r.cancelled ? [t("documents.cancelled")] : [])
              : [`${t("ledger.kinds.payment")}${r.operation.paymentMethodLabel ? ` · ${r.operation.paymentMethodLabel}` : ""}`].concat(r.cancelled ? [t("documents.cancelled")] : []),
          taken: r.taken ? formatAmount(r.taken) : "",
          paid: r.paid ? formatAmount(r.paid) : "",
          balance: signedAmount(r.balanceAfter),
          cancelled: r.cancelled,
        })),
        totals: { label: t("documents.totals"), taken: formatAmount(s.totalTaken), paid: formatAmount(s.totalPaid), balance: signedAmount(s.closingBalance) },
        cancelledNote: t("documents.cancelledNote"),
        editedLine: t("documents.edited", { date: dateTime(new Date().toISOString(), shop.timezone) }),
        pageLabel: (page, pages) => t("documents.page", { page, pages }),
      });
      const mode = await shareOrDownload(blob, statementFileName(customer.fullName, period.from, period.to), t("documents.statementTitle"));
      setDone(mode === "cancelled" ? null : t(mode === "shared" ? "documents.shared" : "documents.downloaded"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div onChange={(e) => setChoice((e.target as HTMLInputElement).value as typeof choice)}>
        <ChoiceGroup
          legend={t("documents.choosePeriod")}
          name="period"
          type="radio"
          defaultValues={[choice]}
          options={(["current", "previous", "custom"] as const).map((value) => ({ value, label: t(`documents.periods.${value}`) }))}
        />
      </div>
      {choice === "custom" ? (
        <div className="grid grid-cols-2 gap-3">
          <TextField label={t("documents.from")} type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
          <TextField label={t("documents.to")} type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
        </div>
      ) : null}
      {done ? <Notice tone="positive">{done}</Notice> : null}
      <Button variant="primary" block disabled={busy || !valid} onClick={() => void generate()}>
        {busy ? t("documents.preparing") : t("documents.makeStatement")}
      </Button>
      <p className="text-sm text-gris-texte">{t("documents.shareHint")}</p>
    </div>
  );
}

/** Relance WhatsApp préremplie, polie, modifiable avant envoi (relance toujours manuelle). */
export function RemindLink({ customer, balance, shopName }: { customer: DocCustomer; balance: number; shopName: string }) {
  const t = useTranslations();
  if (!customer.phone || balance >= 0) return null;
  const message = t("reminders.message", { name: customer.fullName, shop: shopName, amount: formatAmount(-balance) });
  return (
    <a
      href={whatsAppLink(message, customer.phone)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-12 items-center justify-center rounded-bouton bg-vert-doux px-3 text-center font-bold text-vert-fonce"
    >
      {t("reminders.send")}
    </a>
  );
}
