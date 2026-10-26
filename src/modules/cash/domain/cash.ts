// Caisse (RG7) : clôture de journée, ventes au comptant déduites, ventes du jour. Code pur.
// Voir docs/decisions/0015-caisse-et-tableau-de-bord.md.
import { localDate, type Amount } from "@/shared/domain";

export interface ClosingRecord {
  id: string;
  /** Jour de la boutique (AAAA-MM-JJ). */
  businessDate: string;
  /** Tout l'argent reçu dans la journée, tous moyens confondus (hors fond de caisse). */
  totalReceived: Amount;
  amounts: { paymentMethodId: string; amount: Amount }[];
  note: string | null;
  authorId: string;
  deviceCreatedAt: string;
  /** null : saisie encore sur l'appareil (plus récente que tout ce que le serveur a reçu). */
  serverCreatedAt: string | null;
}

/** Ordre « la dernière fait foi » : saisies locales en attente d'abord, puis réception par le serveur. */
function isNewer(a: ClosingRecord, b: ClosingRecord): boolean {
  if ((a.serverCreatedAt === null) !== (b.serverCreatedAt === null)) return a.serverCreatedAt === null;
  if (a.serverCreatedAt && b.serverCreatedAt && a.serverCreatedAt !== b.serverCreatedAt) return a.serverCreatedAt > b.serverCreatedAt;
  return a.deviceCreatedAt > b.deviceCreatedAt;
}

/** Clôture qui fait foi pour chaque jour (une nouvelle clôture du même jour remplace l'ancienne, l'historique reste). */
export function latestClosings(closings: readonly ClosingRecord[]): Map<string, ClosingRecord> {
  const byDate = new Map<string, ClosingRecord>();
  for (const closing of closings) {
    const current = byDate.get(closing.businessDate);
    if (!current || isNewer(closing, current)) byDate.set(closing.businessDate, closing);
  }
  return byDate;
}

// ---------------------------------------------------------------------------
// Flux connus d'une journée (journal client et ventes de sacs entiers)
// ---------------------------------------------------------------------------

export interface FlowOperation {
  id: string;
  kind: "take" | "payment" | "cancellation";
  amount: Amount | null;
  cancelsOperationId: string | null;
  deviceCreatedAt: string;
  paymentMethodId?: string | null;
}

export interface WholeSale {
  id: string;
  productId: string;
  amount: Amount;
  /** Prise créée sur le compte d'un client (null : vente au comptant). */
  customerOperationId: string | null;
  deviceCreatedAt: string;
  cancelled: boolean;
}

export interface DayFlows {
  /** Prises à compte du jour (y compris les sacs entiers vendus sur un compte client). */
  accountTakes: Amount;
  /** Versements des clients à compte du jour. */
  payments: Amount;
  paymentsByMethod: Map<string, Amount>;
  /** Ventes de conditionnements entiers au comptant du jour. */
  wholeSalesCash: Amount;
}

/** Les opérations annulées (et les annulations elles-mêmes) ne comptent pas ; le jour est celui de la saisie, dans le fuseau de la boutique. */
export function dayFlows(input: { operations: readonly FlowOperation[]; wholeSales: readonly WholeSale[]; date: string; timeZone: string }): DayFlows {
  const cancelled = new Set(input.operations.filter((o) => o.kind === "cancellation" && o.cancelsOperationId).map((o) => o.cancelsOperationId!));
  const flows: DayFlows = { accountTakes: 0, payments: 0, paymentsByMethod: new Map(), wholeSalesCash: 0 };
  for (const op of input.operations) {
    if (op.kind === "cancellation" || cancelled.has(op.id) || localDate(op.deviceCreatedAt, input.timeZone) !== input.date) continue;
    const amount = op.amount ?? 0;
    if (op.kind === "take") flows.accountTakes += amount;
    else {
      flows.payments += amount;
      const method = op.paymentMethodId ?? "";
      flows.paymentsByMethod.set(method, (flows.paymentsByMethod.get(method) ?? 0) + amount);
    }
  }
  for (const sale of input.wholeSales) {
    if (sale.cancelled || sale.customerOperationId || localDate(sale.deviceCreatedAt, input.timeZone) !== input.date) continue;
    flows.wholeSalesCash += sale.amount;
  }
  return flows;
}

/**
 * Ventes au comptant au détail déduites de la clôture (RG7) :
 * tout l'argent reçu − versements des clients à compte − ventes de sacs entiers au comptant.
 * Un résultat négatif est renvoyé tel quel : l'écran le signale (erreur de saisie probable), jamais corrigé en silence.
 */
export function counterCashSales(totalReceived: Amount, flows: Pick<DayFlows, "payments" | "wholeSalesCash">): Amount {
  return totalReceived - flows.payments - flows.wholeSalesCash;
}

// ---------------------------------------------------------------------------
// Ventes du jour
// ---------------------------------------------------------------------------

export interface DaySales {
  accountTakes: Amount;
  wholeSalesCash: Amount;
  /** Ventes au comptant au détail : déduites de la clôture, ou estimées sans clôture (null si rien ne permet d'estimer). */
  counterCash: Amount | null;
  /** « closed » : clôture enregistrée ; « estimated » : comptant estimé d'après les bilans de sac ; « unknown » : pas d'estimation possible. */
  basis: "closed" | "estimated" | "unknown";
  /** Ventes du jour = prises à compte + sacs entiers au comptant + comptant au détail. */
  total: Amount;
  /** Clôture incohérente : plus de versements et de sacs entiers que d'argent reçu. */
  negativeCounterCash: boolean;
}

export function daySales(flows: DayFlows, closing: Pick<ClosingRecord, "totalReceived"> | null, estimatedCounterCash: Amount | null): DaySales {
  const counterCash = closing ? counterCashSales(closing.totalReceived, flows) : estimatedCounterCash;
  return {
    accountTakes: flows.accountTakes,
    wholeSalesCash: flows.wholeSalesCash,
    counterCash,
    basis: closing ? "closed" : counterCash === null ? "unknown" : "estimated",
    total: flows.accountTakes + flows.wholeSalesCash + (counterCash ?? 0),
    negativeCounterCash: closing !== null && (counterCash ?? 0) < 0,
  };
}

// ---------------------------------------------------------------------------
// Estimation sans clôture, d'après les bilans de sac
// ---------------------------------------------------------------------------

export interface ReviewForEstimate {
  productId: string;
  openedAt: string | null;
  finishedAt: string | null;
  estimatedCashSales: Amount;
}

const DAY_MS = 86_400_000;
/** Un sac écoulé en quelques heures ne doit pas faire exploser l'estimation. */
const MIN_DURATION_MS = DAY_MS / 4;

/**
 * Comptant au détail estimé pour une journée : pour chaque produit, rythme moyen des derniers sacs
 * (Σ comptant estimé / Σ durées d'écoulement), sur les `perProduct` derniers bilans. Approximation affichée comme telle.
 */
export function estimatedDailyCounterCash(reviews: readonly ReviewForEstimate[], perProduct = 3): Amount | null {
  const byProduct = new Map<string, ReviewForEstimate[]>();
  for (const r of reviews) {
    if (!r.openedAt || !r.finishedAt) continue;
    byProduct.set(r.productId, [...(byProduct.get(r.productId) ?? []), r]);
  }
  if (byProduct.size === 0) return null;
  let total = 0;
  for (const list of byProduct.values()) {
    const recent = [...list].sort((a, b) => b.finishedAt!.localeCompare(a.finishedAt!)).slice(0, perProduct);
    const cash = recent.reduce((s, r) => s + Math.max(0, r.estimatedCashSales), 0);
    const duration = recent.reduce((s, r) => s + Math.max(MIN_DURATION_MS, new Date(r.finishedAt!).getTime() - new Date(r.openedAt!).getTime()), 0);
    total += (cash * DAY_MS) / duration;
  }
  return Math.round(total);
}
