"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { formatAmount, parseQuantity, type RoundingStep } from "@/shared/domain";
import { AmountInput, Balance, Button, Notice, TextField } from "@/shared/ui";
import { SALE_UNITS, balanceAfter, buildDetailedTake, type SaleUnit, type TakeLine } from "../domain/operations";

export interface TakeDraft {
  id: string;
  mode: "quick" | "detailed";
  amount: number;
  note: string | null;
  lines: TakeLine[];
}

interface LineDraft {
  key: string;
  label: string;
  quantity: string;
  unit: SaleUnit;
  unitPrice: string;
}

const emptyLine = (): LineDraft => ({ key: crypto.randomUUID(), label: "", quantity: "1", unit: "kg", unitPrice: "" });

/**
 * Nouvelle prise : mode rapide (montant + note, < 10 s) ou détaillé (articles × quantité × prix figé).
 * Le nouveau solde et l'alerte de plafond s'affichent en direct ; le plafond n'est jamais bloquant.
 * La saisie est écrite sur l'appareil (onSave) : elle fonctionne sans réseau.
 */
export function TakeForm({
  onSave,
  balance,
  creditLimit,
  roundingStep,
}: {
  onSave: (draft: TakeDraft) => void;
  balance: number;
  creditLimit: number | null;
  roundingStep: RoundingStep;
}) {
  const t = useTranslations("ledger");
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const [operationId] = useState(() => crypto.randomUUID());
  const [note, setNote] = useState("");
  const [error, setError] = useState<"amountRequired" | "lineInvalid" | null>(null);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"quick" | "detailed">("quick");
  const [quickAmount, setQuickAmount] = useState<number | null>(null);
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  const detailed = useMemo(
    () =>
      buildDetailedTake(
        lines.map((l) => ({
          label: l.label,
          quantity: parseQuantity(l.quantity) ?? 0,
          unit: l.unit,
          unitPrice: Number(l.unitPrice.replace(/\D/g, "")) || 0,
        })),
        roundingStep,
      ),
    [lines, roundingStep],
  );
  const total = mode === "quick" ? (quickAmount ?? 0) : detailed.ok ? detailed.total : 0;
  const newBalance = balanceAfter(balance, "take", total);
  const excess = creditLimit && -newBalance > creditLimit ? -newBalance - creditLimit : 0;
  const update = (key: string, patch: Partial<LineDraft>) => setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (saving) return;
        if (mode === "quick" && total <= 0) return setError("amountRequired");
        if (mode === "detailed" && !detailed.ok) return setError("lineInvalid");
        setSaving(true);
        onSave({ id: operationId, mode, amount: total, note: note.trim() || null, lines: mode === "detailed" && detailed.ok ? detailed.lines : [] });
      }}
      className="flex flex-col gap-5 pb-40"
    >

      <div role="radiogroup" aria-label={t("mode")} className="grid grid-cols-2 gap-1 rounded-bouton bg-vert-doux p-1">
        {(["quick", "detailed"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => setMode(value)}
            className={`min-h-11 rounded-xl font-bold ${mode === value ? "bg-surface text-vert-principal shadow-sm" : "text-vert-fonce"}`}
          >
            {value === "quick" ? t("quickTake") : t("detailedTake")}
          </button>
        ))}
      </div>


      {mode === "quick" ? (
        <>
          <AmountInput label={t("amount")} name="amount" autoFocus onValueChange={setQuickAmount} error={error === "amountRequired" ? te("amountRequired") : null} />
          <TextField
            label={`${t("note")} (${tc("optional")})`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("notePlaceholder")}
            autoComplete="off"
          />
        </>
      ) : (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-semibold text-encre">{t("lines.title")}</legend>
          {lines.map((line, index) => {
            const computed = detailed.ok ? detailed.lines[index] : undefined;
            return (
              <div key={line.key} className="rounded-bouton border border-bordure bg-fond p-3">
                <div className="flex items-end gap-2">
                  <TextField
                    className="flex-1"
                    label={t("lines.label")}
                    value={line.label}
                    onChange={(event) => update(line.key, { label: event.target.value })}
                    autoComplete="off"
                  />
                  {lines.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                      aria-label={t("lines.remove", { index: index + 1 })}
                      className="mb-1 flex size-11 items-center justify-center rounded-xl text-brique hover:bg-brique-doux"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  ) : null}
                </div>
                <div className="mt-2 grid grid-cols-[1fr_auto_1.3fr] gap-2">
                  <TextField
                    label={t("lines.quantity")}
                    value={line.quantity}
                    inputMode="decimal"
                    onChange={(event) => update(line.key, { quantity: event.target.value })}
                  />
                  <label className="flex flex-col">
                    <span className="mb-1.5 text-sm font-semibold text-encre">{t("lines.unit")}</span>
                    <select
                      value={line.unit}
                      onChange={(event) => update(line.key, { unit: event.target.value as SaleUnit })}
                      className="h-13 rounded-bouton border border-bordure-champ bg-surface px-2 text-base"
                    >
                      {SALE_UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {t(`units.${unit}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <TextField
                    label={t("lines.unitPrice")}
                    value={line.unitPrice}
                    inputMode="numeric"
                    onChange={(event) => update(line.key, { unitPrice: event.target.value.replace(/\D/g, "") })}
                  />
                </div>
                {computed ? (
                  <p className="mt-2 text-right text-sm text-gris-texte">
                    {t("lines.lineAmount")}
                    <span> : </span>
                    <span className="montant font-bold text-encre">{formatAmount(computed.lineAmount)}</span>
                  </p>
                ) : null}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setLines((current) => [...current, emptyLine()])}
            className="min-h-12 rounded-bouton border-2 border-dashed border-bordure-champ font-bold text-vert-fonce hover:bg-vert-doux"
          >
            {t("lines.add")}
          </button>
          <p className="text-xs text-gris-texte">{t("lines.rounding", { step: roundingStep })}</p>
          {error === "lineInvalid" ? <Notice tone="danger">{te("lineInvalid")}</Notice> : null}
          <TextField label={`${t("note")} (${tc("optional")})`} value={note} onChange={(event) => setNote(event.target.value)} autoComplete="off" />
        </fieldset>
      )}

      {/* Pied d'écran (zone du pouce) : total, nouveau solde, alerte de plafond, enregistrer. */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-bordure bg-surface px-4 pt-3 pb-3 shadow-[0_-4px_16px_rgba(16,35,27,0.08)] lg:bottom-0 lg:left-68">
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          {excess > 0 ? (
            <p role="status" className="rounded-xl bg-brique-doux px-3 py-2 text-sm font-semibold text-brique">
              {t("limitWarning", { limit: formatAmount(creditLimit!), excess: formatAmount(excess) })}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-gris-texte">{t("newBalance")}</p>
              <Balance value={newBalance} />
            </div>
            <Button type="submit" variant="accent" disabled={total <= 0 || saving} className="flex-1 py-2 text-lg sm:flex-none sm:px-8">
              <span className="flex flex-col leading-tight">
                <span>{t("saveTake")}</span>
                <span className="montant text-base">{formatAmount(total)}</span>
              </span>
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
