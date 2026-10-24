// Montants en francs CFA (XOF) : toujours des entiers, jamais de flottant (invariant 3).
// Les montants restent bien en deçà de Number.MAX_SAFE_INTEGER (9 × 10^15 F).

import { QUANTITY_SCALE, type Quantity } from "./quantity";

/** Montant entier dans la devise de la boutique (XOF par défaut). */
export type Amount = number;

/** Pas d'arrondi des lignes de vente, réglable par boutique (RG3). */
export const ROUNDING_STEPS = [1, 5, 25] as const;
export type RoundingStep = (typeof ROUNDING_STEPS)[number];
export const DEFAULT_ROUNDING_STEP: RoundingStep = 5;

export function assertAmount(value: number): asserts value is Amount {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Montant invalide (entier attendu) : ${value}`);
  }
}

/**
 * Division entière arrondie au plus proche, la moitié vers le haut (vers +∞).
 * Opère sur des entiers exacts (bigint) pour ne jamais passer par un flottant.
 */
export function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError("Le diviseur doit être positif");
  // floor((2n + d) / 2d), avec une division euclidienne correcte pour n < 0.
  const twice = 2n * numerator + denominator;
  const divisor = 2n * denominator;
  const quotient = twice / divisor;
  return twice % divisor !== 0n && twice < 0n ? quotient - 1n : quotient;
}

/**
 * Montant d'une ligne en quantité libre (RG3) :
 * quantité × prix unitaire, arrondi PAR LIGNE au pas de la boutique,
 * au plus proche, la moitié vers le haut.
 *
 * Exemple : 0,25 kg × 315 F/kg = 78,75 F → 80 F (pas de 5 F).
 */
export function lineAmount(quantity: Quantity, unitPrice: Amount, step: RoundingStep = DEFAULT_ROUNDING_STEP): Amount {
  assertAmount(unitPrice);
  if (!ROUNDING_STEPS.includes(step)) throw new RangeError(`Pas d'arrondi non pris en charge : ${step}`);
  const exactTimesScale = BigInt(quantity) * BigInt(unitPrice);
  const steps = divideRoundHalfUp(exactTimesScale, BigInt(QUANTITY_SCALE) * BigInt(step));
  return Number(steps * BigInt(step));
}

/** Total d'une prise = somme des lignes déjà arrondies (RG3). */
export function sumAmounts(amounts: readonly Amount[]): Amount {
  return amounts.reduce<number>((total, amount) => {
    assertAmount(amount);
    const next = total + amount;
    assertAmount(next);
    return next;
  }, 0);
}

const NBSP = " ";

/**
 * Formate un montant : « 13 680 F », « −2 205 F ».
 * Séparateur de milliers : espace insécable (U+00A0), signe moins typographique.
 */
export function formatAmount(amount: Amount, options: { currencySymbol?: string; signDisplay?: "auto" | "always" } = {}): string {
  assertAmount(amount);
  const { currencySymbol = "F", signDisplay = "auto" } = options;
  const digits = Math.abs(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const sign = amount < 0 ? "−" : signDisplay === "always" && amount > 0 ? "+" : "";
  return `${sign}${digits}${NBSP}${currencySymbol}`;
}
