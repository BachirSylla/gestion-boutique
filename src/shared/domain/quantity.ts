// Quantités de produit en millièmes d'unité de vente, stockées en entiers (invariant 3).
// 1 kg = 1 000 ; 0,5 L = 500 ; 1 pièce = 1 000. Aucun flottant dans les calculs.

export const QUANTITY_SCALE = 1000;

/** Quantité exprimée en millièmes d'unité de vente. */
export type Quantity = number;

export function assertQuantity(value: number): asserts value is Quantity {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Quantité invalide (entier de millièmes attendu) : ${value}`);
  }
}

/**
 * Convertit une saisie décimale (« 0,5 », « 1.25 », « 2 ») en millièmes.
 * Refuse plus de trois décimales plutôt que d'arrondir en silence.
 */
export function parseQuantity(input: string): Quantity | null {
  const normalized = input.trim().replace(",", ".");
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(normalized);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(3, "0"));
  const value = whole * QUANTITY_SCALE + fraction;
  return Number.isSafeInteger(value) ? value : null;
}

/** Affiche une quantité en notation française : 500 → « 0,5 », 1250 → « 1,25 ». */
export function formatQuantity(quantity: Quantity): string {
  assertQuantity(quantity);
  const sign = quantity < 0 ? "−" : "";
  const abs = Math.abs(quantity);
  const whole = Math.floor(abs / QUANTITY_SCALE);
  const fraction = (abs % QUANTITY_SCALE).toString().padStart(3, "0").replace(/0+$/, "");
  return fraction ? `${sign}${whole},${fraction}` : `${sign}${whole}`;
}
