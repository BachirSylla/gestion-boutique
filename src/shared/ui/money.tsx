"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { formatAmount, type Amount } from "@/shared/domain";

/** Montant en chiffres tabulaires : « 13 680 F ». */
export function AmountText({ value, signed = false, className = "" }: { value: Amount; signed?: boolean; className?: string }) {
  return <span className={`montant whitespace-nowrap ${className}`}>{formatAmount(value, { signDisplay: signed ? "always" : "auto" })}</span>;
}

/**
 * Solde d'un client. Dette et avance ne se distinguent jamais par la couleur seule :
 * signe (− / +) ET libellé (« doit » / « avance ») toujours présents (CLAUDE.md §8.2).
 */
export function Balance({ value, size = "md" }: { value: Amount; size?: "sm" | "md" | "xl" }) {
  const t = useTranslations("money");
  const tone = value < 0 ? "text-brique" : value > 0 ? "text-vert-positif" : "text-gris-texte";
  const label = value < 0 ? t("owes") : value > 0 ? t("advance") : t("settled");
  const sizes = { sm: "text-base", md: "text-lg", xl: "text-4xl sm:text-5xl" };
  return (
    <span className={`inline-flex flex-col items-end leading-tight ${tone}`}>
      <span className={`montant font-extrabold ${sizes[size]}`}>{formatAmount(value, { signDisplay: "always" })}</span>
      <span className={`font-semibold ${size === "xl" ? "text-base" : "text-xs"}`}>{label}</span>
    </span>
  );
}

/** Saisie d'un montant : clavier numérique, séparateur de milliers en direct. */
export function AmountInput({
  label,
  name,
  defaultValue,
  onValueChange,
  error,
  autoFocus,
  size = "lg",
}: {
  label: string;
  name: string;
  defaultValue?: number | null;
  onValueChange?: (value: number | null) => void;
  error?: string | null;
  autoFocus?: boolean;
  size?: "md" | "lg";
}) {
  const id = useId();
  const [display, setDisplay] = useState(defaultValue ? group(String(defaultValue)) : "");
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-encre">
        {label}
      </label>
      <div
        className={`flex items-center rounded-bouton border bg-surface focus-within:border-vert-principal focus-within:ring-2 focus-within:ring-vert-principal/20 ${
          error ? "border-brique" : "border-bordure-champ"
        }`}
      >
        <input
          id={id}
          name={name}
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          value={display}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 12);
            setDisplay(group(digits));
            onValueChange?.(digits ? Number(digits) : null);
          }}
          className={`montant w-full min-w-0 flex-1 rounded-bouton bg-transparent px-4 font-extrabold text-encre outline-none ${
            size === "lg" ? "h-16 text-3xl" : "h-13 text-xl"
          }`}
        />
        <span aria-hidden="true" className="pr-4 text-xl font-bold text-gris-texte">
          F
        </span>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm font-medium text-brique">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
