// Catalogue et prix (RG2, RG3, RG4) : règles pures.
import { divideRoundHalfUp, type Amount, type Quantity, type RoundingStep } from "@/shared/domain";

export const SALE_UNITS = ["kg", "l", "piece", "sachet"] as const;
export type ProductUnit = (typeof SALE_UNITS)[number];

export interface PriceFormat {
  id?: string;
  label: string;
  /** Quantité du format en millièmes d'unité de vente (½ kg = 500). */
  quantityMilli: Quantity;
  price: Amount;
}

export interface PriceGrid {
  retailPrice: Amount;
  packagePrice: Amount | null;
  formats: PriceFormat[];
}

export type PricePolicy = "immediate" | "after_sellout";

/** Politique proposée par défaut (réglages de la boutique) : hausse ou baisse ; à prix égal, immédiat. */
export function defaultPolicy(oldRetail: Amount, newRetail: Amount, settings: { hike: PricePolicy; drop: PricePolicy }): PricePolicy {
  if (newRetail > oldRetail) return settings.hike;
  if (newRetail < oldRetail) return settings.drop;
  return "immediate";
}

/**
 * Prix de format proposés quand le prix de détail change : on garde l'écart choisi par le boutiquier
 * (riz ½ kg à 160 F pour 315 F/kg) en appliquant la même variation, arrondie au pas de la boutique.
 * Ex. 315 → 330 F/kg : 160 × 330 / 315 = 167,6 → 170 F au pas de 5 F. Le propriétaire ajuste ensuite.
 */
export function proposeFormatPrices(formats: readonly PriceFormat[], oldRetail: Amount, newRetail: Amount, step: RoundingStep): PriceFormat[] {
  return formats.map((format) => {
    const scaled = divideRoundHalfUp(BigInt(format.price) * BigInt(newRetail), BigInt(oldRetail) * BigInt(step)) * BigInt(step);
    return { ...format, price: Math.max(step, Number(scaled)) };
  });
}

/** Prix du format calculé depuis le prix de détail (point de départ pour un nouveau format). */
export function formatPriceFromRetail(quantityMilli: Quantity, retailPrice: Amount, step: RoundingStep): Amount {
  return Math.max(step, Number(divideRoundHalfUp(BigInt(quantityMilli) * BigInt(retailPrice), 1000n * BigInt(step)) * BigInt(step)));
}

export type GridError = "retailPriceInvalid" | "packagePriceInvalid" | "formatInvalid";

export function validateGrid(grid: PriceGrid): GridError | null {
  if (!Number.isSafeInteger(grid.retailPrice) || grid.retailPrice <= 0) return "retailPriceInvalid";
  if (grid.packagePrice !== null && (!Number.isSafeInteger(grid.packagePrice) || grid.packagePrice <= 0)) return "packagePriceInvalid";
  for (const f of grid.formats) {
    if (!f.label.trim() || !Number.isSafeInteger(f.quantityMilli) || f.quantityMilli <= 0 || !Number.isSafeInteger(f.price) || f.price <= 0) return "formatInvalid";
  }
  return null;
}

/** Ligne de prise « format » : nombre × prix du format, sans arrondi ; quantité totale pour le stock. */
export function formatLine(product: { id: string; name: string; saleUnit: ProductUnit }, format: PriceFormat, count: number) {
  return {
    label: `${product.name} ${format.label}`,
    productId: product.id,
    quantity: format.quantityMilli * count,
    unit: product.saleUnit,
    unitPrice: format.price,
    formatLabel: format.label,
    formatCount: count,
    lineAmount: format.price * count,
  };
}

/** Reste estimé d'un conditionnement entamé, en millièmes de sa contenance (presque vide = 10 %). */
export const REMAINING_ESTIMATES = { full: 1000, threeQuarters: 750, half: 500, quarter: 250, almostEmpty: 100 } as const;
export type RemainingEstimate = keyof typeof REMAINING_ESTIMATES;
