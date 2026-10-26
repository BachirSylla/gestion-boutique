// Rapports (RG7, RG8) : bénéfice brut et argent encaissé sur une période. Code pur.
// Voir docs/decisions/0015-caisse-et-tableau-de-bord.md.
import { dayFlows, latestClosings, type ClosingRecord, type FlowOperation, type WholeSale } from "@/modules/cash";
import { daysBetween, localDate, type Amount } from "@/shared/domain";

export interface Period {
  from: string;
  to: string;
}

export function inPeriod(date: string, period: Period): boolean {
  return date >= period.from && date <= period.to;
}

/** Jours calendaires d'une période, bornes comprises. */
export function periodDays(period: Period): string[] {
  const n = daysBetween(period.from, period.to);
  const [y, m, d] = period.from.split("-").map(Number) as [number, number, number];
  return Array.from({ length: Math.max(0, n + 1) }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
}

export interface ReviewForProfit {
  productId: string;
  finishedAt: string | null;
  expectedRevenue: Amount;
  estimatedCashSales: Amount;
  grossMargin: Amount;
}

export interface WholeSaleForProfit extends WholeSale {
  /** Prix d'achat du conditionnement (celui de son lot). */
  cost: Amount;
}

export interface ProductProfit {
  productId: string;
  /** Marges des bilans de sac terminés dans la période. */
  reviewsMargin: Amount;
  packagesFinished: number;
  /** Marges des conditionnements vendus entiers dans la période (comptant ou compte client). */
  wholeSalesMargin: Amount;
  wholeSold: number;
  margin: Amount;
}

export interface GrossProfit {
  total: Amount;
  reviewsMargin: Amount;
  wholeSalesMargin: Amount;
  byProduct: ProductProfit[];
}

/**
 * Bénéfice brut (RG8) = Σ marges des bilans de sac + Σ marges des ventes de conditionnements entiers.
 * Un bilan compte le jour où le sac est terminé ; une vente entière, le jour de la vente. Ventes annulées exclues.
 */
export function grossProfit(input: { reviews: readonly ReviewForProfit[]; wholeSales: readonly WholeSaleForProfit[]; period: Period; timeZone: string }): GrossProfit {
  const byProduct = new Map<string, ProductProfit>();
  const row = (productId: string) => {
    let r = byProduct.get(productId);
    if (!r) {
      r = { productId, reviewsMargin: 0, packagesFinished: 0, wholeSalesMargin: 0, wholeSold: 0, margin: 0 };
      byProduct.set(productId, r);
    }
    return r;
  };
  for (const review of input.reviews) {
    if (!review.finishedAt || !inPeriod(localDate(review.finishedAt, input.timeZone), input.period)) continue;
    const r = row(review.productId);
    r.reviewsMargin += review.grossMargin;
    r.packagesFinished += 1;
  }
  for (const sale of input.wholeSales) {
    if (sale.cancelled || !inPeriod(localDate(sale.deviceCreatedAt, input.timeZone), input.period)) continue;
    const r = row(sale.productId);
    r.wholeSalesMargin += sale.amount - sale.cost;
    r.wholeSold += 1;
  }
  const rows = [...byProduct.values()].map((r) => ({ ...r, margin: r.reviewsMargin + r.wholeSalesMargin })).sort((a, b) => b.margin - a.margin);
  const reviewsMargin = rows.reduce((s, r) => s + r.reviewsMargin, 0);
  const wholeSalesMargin = rows.reduce((s, r) => s + r.wholeSalesMargin, 0);
  return { total: reviewsMargin + wholeSalesMargin, reviewsMargin, wholeSalesMargin, byProduct: rows };
}

export interface PeriodCash {
  /**
   * Argent encaissé : jours clôturés → tout l'argent reçu déclaré ; autres jours → versements et sacs entiers
   * au comptant seulement (le comptant au détail n'est pas connu sans clôture).
   */
  collected: Amount;
  /** Ventes au comptant au détail déclarées par les clôtures (jours clôturés). */
  counterCashDeclared: Amount;
  /** Comptant estimé des bilans de sac terminés dans la période (affiché à côté, sans contrôle automatique). */
  counterCashExpected: Amount;
  /** Prises à compte de la période (ventes à crédit : du bénéfice avant que l'argent ne rentre). */
  accountTakes: Amount;
  closedDays: number;
  days: number;
}

export function periodCash(input: {
  operations: readonly FlowOperation[];
  wholeSales: readonly WholeSale[];
  closings: readonly ClosingRecord[];
  reviews: readonly ReviewForProfit[];
  period: Period;
  timeZone: string;
}): PeriodCash {
  const closings = latestClosings(input.closings);
  const days = periodDays(input.period);
  const result: PeriodCash = { collected: 0, counterCashDeclared: 0, counterCashExpected: 0, accountTakes: 0, closedDays: 0, days: days.length };
  for (const date of days) {
    const flows = dayFlows({ operations: input.operations, wholeSales: input.wholeSales, date, timeZone: input.timeZone });
    result.accountTakes += flows.accountTakes;
    const closing = closings.get(date);
    if (closing) {
      result.closedDays += 1;
      result.collected += closing.totalReceived;
      result.counterCashDeclared += closing.totalReceived - flows.payments - flows.wholeSalesCash;
    } else {
      result.collected += flows.payments + flows.wholeSalesCash;
    }
  }
  for (const review of input.reviews) {
    if (review.finishedAt && inPeriod(localDate(review.finishedAt, input.timeZone), input.period)) result.counterCashExpected += review.estimatedCashSales;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Choix de la période (écran Bénéfices)
// ---------------------------------------------------------------------------

export type PeriodChoice = "current" | "previous" | "custom";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Une période choisie à la main ne dépasse pas un an (rapport lisible, requêtes bornées). */
export const MAX_PERIOD_DAYS = 366;

/**
 * Période demandée (paramètres de l'adresse) → période valide. Par défaut : le mois en cours jusqu'à aujourd'hui.
 * Dates invalides, inversées ou trop éloignées : retour au mois en cours.
 */
export function resolvePeriod(params: { period?: string; from?: string; to?: string }, today: string): { choice: PeriodChoice; period: Period } {
  const current = { from: `${today.slice(0, 7)}-01`, to: today };
  if (params.period === "previous") {
    const [y, m] = today.split("-").map(Number) as [number, number];
    const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
    const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
    const mm = String(pm).padStart(2, "0");
    return { choice: "previous", period: { from: `${py}-${mm}-01`, to: `${py}-${mm}-${String(last).padStart(2, "0")}` } };
  }
  if (params.period === "custom" && params.from && params.to && DATE.test(params.from) && DATE.test(params.to)) {
    const valid = !Number.isNaN(Date.parse(params.from)) && !Number.isNaN(Date.parse(params.to));
    const span = valid ? daysBetween(params.from, params.to) : -1;
    if (span >= 0 && span < MAX_PERIOD_DAYS && params.to <= today) return { choice: "custom", period: { from: params.from, to: params.to } };
  }
  return { choice: "current", period: current };
}
