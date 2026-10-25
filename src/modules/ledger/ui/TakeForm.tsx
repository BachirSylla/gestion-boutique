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

/** Produit proposé dans la prise (dernier prix connu sur l'appareil, RG3). */
export interface TakeProduct {
  id: string;
  name: string;
  saleUnit: SaleUnit;
  retailPrice: number | null;
  formats: { label: string; quantityMilli: number; price: number }[];
}

interface LineDraft {
  key: string;
  productId: string | null;
  label: string;
  quantity: string;
  unit: SaleUnit;
  unitPrice: string;
  /** Ligne « format » : nombre de formats (½ kg…) au prix du format. */
  format: { label: string; quantityMilli: number; count: number } | null;
}

const emptyLine = (): LineDraft => ({ key: crypto.randomUUID(), productId: null, label: "", quantity: "1", unit: "kg", unitPrice: "", format: null });

const RemoveIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/**
 * Nouvelle prise : mode rapide (montant + note, < 10 s ; puces de produits fréquents pour la note) ou
 * détaillé (favoris en un toucher, articles × quantité × prix figé). Le nouveau solde et l'alerte de
 * plafond s'affichent en direct ; le plafond n'est jamais bloquant. Écrit sur l'appareil : sans réseau.
 */
export function TakeForm({
  onSave,
  balance,
  creditLimit,
  roundingStep,
  products = [],
}: {
  onSave: (draft: TakeDraft) => void;
  balance: number;
  creditLimit: number | null;
  roundingStep: RoundingStep;
  products?: TakeProduct[];
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
  const favorites = products.flatMap((product) => product.formats.map((format) => ({ product, format })));
  const [lines, setLines] = useState<LineDraft[]>(() => (favorites.length ? [] : [emptyLine()]));

  const detailed = useMemo(
    () =>
      buildDetailedTake(
        lines.map((l) => ({
          label: l.label,
          quantity: l.format ? l.format.quantityMilli * l.format.count : (parseQuantity(l.quantity) ?? 0),
          unit: l.unit,
          unitPrice: Number(l.unitPrice.replace(/\D/g, "")) || 0,
          productId: l.productId,
          format: l.format ? { label: l.format.label, count: l.format.count } : null,
        })),
        roundingStep,
      ),
    [lines, roundingStep],
  );
  const total = mode === "quick" ? (quickAmount ?? 0) : detailed.ok ? detailed.total : 0;
  const newBalance = balanceAfter(balance, "take", total);
  const excess = creditLimit && -newBalance > creditLimit ? -newBalance - creditLimit : 0;
  const update = (key: string, patch: Partial<LineDraft>) => setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  /** Favori : ajoute la ligne, ou un format de plus (ou de moins) à la ligne existante. */
  const addFavorite = (product: TakeProduct, format: TakeProduct["formats"][number], delta = 1) =>
    setLines((current) => {
      const existing = current.find((l) => l.productId === product.id && l.format?.label === format.label);
      if (existing?.format) {
        const count = existing.format.count + delta;
        return count <= 0 ? current.filter((l) => l !== existing) : current.map((l) => (l === existing ? { ...l, format: { ...existing.format!, count } } : l));
      }
      if (delta < 0) return current;
      return [
        ...current.filter((l) => l.label || l.unitPrice),
        {
          key: crypto.randomUUID(),
          productId: product.id,
          label: `${product.name} ${format.label}`,
          quantity: "",
          unit: product.saleUnit,
          unitPrice: String(format.price),
          format: { label: format.label, quantityMilli: format.quantityMilli, count: 1 },
        },
      ];
    });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (saving) return;
        if (mode === "quick" && total <= 0) return setError("amountRequired");
        if (mode === "detailed" && (!detailed.ok || total <= 0)) return setError("lineInvalid");
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
          {products.length ? (
            <div>
              <p className="mb-2 text-sm font-semibold text-encre">{t("frequentProducts")}</p>
              <div className="flex flex-wrap gap-2">
                {products.slice(0, 12).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setNote((current) => (current.trim() ? `${current.trim()} + ${p.name.toLowerCase()}` : p.name.toLowerCase()))}
                    className="min-h-10 rounded-full bg-vert-doux px-4 text-sm font-semibold text-vert-fonce"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <fieldset className="flex flex-col gap-3">
          {favorites.length ? (
            <div>
              <p className="mb-2 text-sm font-semibold text-encre">{t("favorites")}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {favorites.map(({ product, format }) => (
                  <button
                    key={`${product.id}-${format.label}`}
                    type="button"
                    onClick={() => addFavorite(product, format)}
                    className="flex min-h-14 flex-col items-start justify-center rounded-bouton border border-bordure bg-surface px-3 py-2 text-left hover:border-vert-principal"
                  >
                    <span className="font-bold text-encre">{[product.name, format.label].join(" ")}</span>
                    <span className="montant text-sm text-gris-texte">{formatAmount(format.price)}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <legend className="mb-2 text-sm font-semibold text-encre">{t("lines.title")}</legend>
          {lines.map((line, index) => {
            const computed = detailed.ok ? detailed.lines[index] : undefined;
            if (line.format) {
              const product = products.find((p) => p.id === line.productId);
              const format = { label: line.format.label, quantityMilli: line.format.quantityMilli, price: Number(line.unitPrice) };
              return (
                <div key={line.key} className="flex items-center justify-between gap-2 rounded-bouton border border-bordure bg-fond p-3">
                  <div className="min-w-0">
                    <p className="font-bold text-encre">{t("formatLine", { count: line.format.count, label: line.label })}</p>
                    <p className="montant text-sm text-gris-texte">{formatAmount(computed?.lineAmount ?? 0)}</p>
                  </div>
                  {product ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => addFavorite(product, format, -1)}
                        aria-label={t("decrease", { label: line.label })}
                        className="size-11 rounded-xl bg-surface text-xl font-bold text-vert-fonce ring-1 ring-bordure"
                      >
                        −
                      </button>
                      <button
                        type="button"
                        onClick={() => addFavorite(product, format)}
                        aria-label={t("increase", { label: line.label })}
                        className="size-11 rounded-xl bg-surface text-xl font-bold text-vert-fonce ring-1 ring-bordure"
                      >
                        +
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            }
            return (
              <div key={line.key} className="rounded-bouton border border-bordure bg-fond p-3">
                {products.length ? (
                  <label className="mb-2 flex flex-col">
                    <span className="mb-1.5 text-sm font-semibold text-encre">{t("product")}</span>
                    <select
                      value={line.productId ?? ""}
                      onChange={(event) => {
                        const product = products.find((p) => p.id === event.target.value);
                        update(
                          line.key,
                          product
                            ? { productId: product.id, label: product.name, unit: product.saleUnit, unitPrice: product.retailPrice ? String(product.retailPrice) : "" }
                            : { productId: null },
                        );
                      }}
                      className="h-13 rounded-bouton border border-bordure-champ bg-surface px-3 text-base"
                    >
                      <option value="">{t("otherItem")}</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <div className="flex items-end gap-2">
                  <TextField className="flex-1" label={t("lines.label")} value={line.label} onChange={(event) => update(line.key, { label: event.target.value })} autoComplete="off" />
                  <button
                    type="button"
                    onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                    aria-label={t("lines.remove", { index: index + 1 })}
                    className="mb-1 flex size-11 items-center justify-center rounded-xl text-brique hover:bg-brique-doux"
                  >
                    <RemoveIcon />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-[1fr_auto_1.3fr] gap-2">
                  <TextField label={t("lines.quantity")} value={line.quantity} inputMode="decimal" onChange={(event) => update(line.key, { quantity: event.target.value })} />
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
