// Stock (RG2, RG4, RG6) : bilan de sac, stock projeté, rupture, inventaire. Code pur.
import { divideRoundHalfUp, type Amount } from "@/shared/domain";

export interface PriceSegment {
  /** Reste au début de la tranche, en millièmes de la contenance (1000 = plein). */
  startRemaining: number;
  retailPrice: Amount;
  createdAt: string;
}

/**
 * Chiffre attendu d'un conditionnement (RG2) : Σ tranches (part vendue × contenance × prix de détail),
 * sans arrondi intermédiaire, arrondi à l'entier à la fin (RG3). Même formule que la vue package_reviews.
 * Ex. 50 kg à 330 F/kg, baisse à 315 F/kg à mi-sac : 25 × 330 + 25 × 315 = 16 125 F.
 */
export function expectedRevenue(segments: readonly PriceSegment[], capacityMilli: number): Amount {
  const sorted = [...segments].sort((a, b) => b.startRemaining - a.startRemaining || a.createdAt.localeCompare(b.createdAt));
  let total = 0n;
  sorted.forEach((segment, i) => {
    const end = sorted[i + 1]?.startRemaining ?? 0;
    total += BigInt(segment.startRemaining - end) * BigInt(capacityMilli) * BigInt(segment.retailPrice);
  });
  return Number(divideRoundHalfUp(total, 1_000_000n));
}

export interface PackageReview {
  expectedRevenue: Amount;
  /** Prises à compte rattachées au conditionnement (lignes détaillées non annulées). */
  accountTakes: Amount;
  /** Ventes au comptant estimées = chiffre attendu − prises à compte (approximation : les prises rapides n'y sont pas). */
  estimatedCashSales: Amount;
  cost: Amount;
  grossMargin: Amount;
  /** Durée d'écoulement en millisecondes. */
  durationMs: number | null;
}

export function packageReview(input: {
  segments: readonly PriceSegment[];
  capacityMilli: number;
  accountTakes: Amount;
  cost: Amount;
  openedAt: string | null;
  finishedAt: string | null;
}): PackageReview {
  const expected = expectedRevenue(input.segments, input.capacityMilli);
  return {
    expectedRevenue: expected,
    accountTakes: input.accountTakes,
    estimatedCashSales: expected - input.accountTakes,
    cost: input.cost,
    grossMargin: expected - input.cost,
    durationMs: input.openedAt && input.finishedAt ? new Date(input.finishedAt).getTime() - new Date(input.openedAt).getTime() : null,
  };
}

// ---------------------------------------------------------------------------
// Stock affiché : état du serveur + saisies en attente sur l'appareil
// ---------------------------------------------------------------------------

export type StockCommand =
  | { type: "stock.receive"; count: number }
  | { type: "stock.open" }
  | { type: "stock.finish" }
  | { type: "stock.sell" }
  | { type: "stock.adjust"; delta: number }
  | { type: "stock.estimate"; estimate: number };

export interface StockView {
  closed: number;
  opened: { remaining: number | null; openedAt: string | null; pending: boolean } | null;
}

export function projectStock(server: StockView, pending: readonly StockCommand[]): StockView {
  let { closed, opened } = server;
  for (const command of pending) {
    switch (command.type) {
      case "stock.receive":
        closed += command.count;
        break;
      case "stock.open":
        if (!opened && closed > 0) {
          closed -= 1;
          opened = { remaining: 1000, openedAt: null, pending: true };
        }
        break;
      case "stock.finish":
        opened = null;
        break;
      case "stock.sell":
        closed = Math.max(0, closed - 1);
        break;
      case "stock.adjust":
        closed = Math.max(0, closed + command.delta);
        break;
      case "stock.estimate":
        if (opened) opened = { ...opened, remaining: command.estimate };
        break;
    }
  }
  return { closed, opened };
}

/** À racheter : nombre de conditionnements fermés au seuil ou en dessous. */
export function needsReorder(closed: number, threshold: number): boolean {
  return closed <= threshold;
}

/**
 * Rupture estimée (RG2) : stock restant (fermés + reste de l'entamé) × durée moyenne d'écoulement
 * des derniers conditionnements terminés. Null sans historique.
 */
export function ruptureEstimate(view: StockView, recentDurationsMs: readonly number[], now: Date): { days: number; date: Date } | null {
  const durations = recentDurationsMs.filter((d) => d > 0).slice(0, 3);
  if (!durations.length) return null;
  const average = durations.reduce((s, d) => s + d, 0) / durations.length;
  const units = view.closed + (view.opened ? (view.opened.remaining ?? 500) / 1000 : 0);
  const ms = units * average;
  return { days: Math.round(ms / 86_400_000), date: new Date(now.getTime() + ms) };
}

/** Estimations proposées pour le reste d'un conditionnement entamé (presque vide = 10 %). */
export const ESTIMATE_CHOICES = [1000, 750, 500, 250, 100] as const;
export type EstimateChoice = (typeof ESTIMATE_CHOICES)[number];

export function estimateKey(remaining: number | null): "full" | "threeQuarters" | "half" | "quarter" | "almostEmpty" | "unknown" {
  if (remaining === null) return "unknown";
  if (remaining >= 875) return "full";
  if (remaining >= 625) return "threeQuarters";
  if (remaining >= 375) return "half";
  if (remaining >= 175) return "quarter";
  return "almostEmpty";
}

/** Inventaire (RG6) : écart entre conditionnements fermés comptés et stock théorique. */
export function inventoryDelta(counted: number, theoretical: number): number {
  return counted - theoretical;
}
