// Journal client (RG1) : opérations, solde, prises détaillées, droits d'annulation.
// Code pur : tourne sur l'appareil (hors ligne, jalon 4) comme sur le serveur.
import { assertAmount, lineAmount, sumAmounts, type Amount, type Quantity, type RoundingStep } from "@/shared/domain";

export type OperationKind = "take" | "payment" | "cancellation";

export interface LedgerOperation {
  id: string;
  kind: OperationKind;
  /** Montant > 0 pour une prise ou un versement ; null pour une annulation. */
  amount: Amount | null;
  cancelsOperationId: string | null;
  authorId: string;
  /** Moment de la saisie sur l'appareil (date métier affichée). */
  deviceCreatedAt: string;
  /** Réception par le serveur (référence du délai d'annulation). */
  serverCreatedAt: string;
}

export function cancelledOperationIds(operations: readonly LedgerOperation[]): Set<string> {
  return new Set(operations.filter((op) => op.kind === "cancellation" && op.cancelsOperationId).map((op) => op.cancelsOperationId!));
}

export interface BalanceSummary {
  /** Versements − prises. Positif : avance détenue ; négatif : dette du client. */
  balance: Amount;
  totalTaken: Amount;
  totalPaid: Amount;
}

/** Solde = Σ versements − Σ prises, opérations annulées exclues. */
export function computeBalance(operations: readonly LedgerOperation[]): BalanceSummary {
  const cancelled = cancelledOperationIds(operations);
  const live = operations.filter((op) => op.kind !== "cancellation" && !cancelled.has(op.id));
  const totalTaken = sumAmounts(live.filter((op) => op.kind === "take").map((op) => op.amount ?? 0));
  const totalPaid = sumAmounts(live.filter((op) => op.kind === "payment").map((op) => op.amount ?? 0));
  return { balance: totalPaid - totalTaken, totalTaken, totalPaid };
}

/** Nouveau solde affiché en direct pendant la saisie. */
export function balanceAfter(balance: Amount, kind: "take" | "payment", amount: Amount): Amount {
  assertAmount(amount);
  return kind === "take" ? balance - amount : balance + amount;
}

// ---------------------------------------------------------------------------
// Prise détaillée (sans stock au jalon 3 ; rattachement au catalogue au jalon 5)
// ---------------------------------------------------------------------------

export const SALE_UNITS = ["kg", "l", "piece", "sachet", "other"] as const;
export type SaleUnit = (typeof SALE_UNITS)[number];

export interface TakeLineInput {
  label: string;
  /** Quantité en millièmes d'unité de vente (pour un format : quantité totale, nombre × quantité du format). */
  quantity: Quantity;
  unit: SaleUnit;
  /** Prix unitaire figé : par unité de vente, ou prix du format. */
  unitPrice: Amount;
  productId?: string | null;
  /** Ligne « format » (½ kg à 160 F…) : montant = nombre × prix du format, sans arrondi (RG3). */
  format?: { label: string; count: number } | null;
}

export interface TakeLine extends TakeLineInput {
  lineAmount: Amount;
}

export type TakeLineError = "labelRequired" | "quantityInvalid" | "priceInvalid" | "amountZero";

/** Lignes avec montant arrondi au pas de la boutique (RG3) ; total = somme des lignes arrondies. */
export function buildDetailedTake(
  inputs: readonly TakeLineInput[],
  step: RoundingStep,
): { ok: true; lines: TakeLine[]; total: Amount } | { ok: false; index: number; error: TakeLineError } {
  const lines: TakeLine[] = [];
  for (const [index, input] of inputs.entries()) {
    if (!input.label.trim()) return { ok: false, index, error: "labelRequired" };
    if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) return { ok: false, index, error: "quantityInvalid" };
    if (!Number.isSafeInteger(input.unitPrice) || input.unitPrice <= 0) return { ok: false, index, error: "priceInvalid" };
    if (input.format && (!Number.isSafeInteger(input.format.count) || input.format.count <= 0)) return { ok: false, index, error: "quantityInvalid" };
    const amount = input.format ? input.format.count * input.unitPrice : lineAmount(input.quantity, input.unitPrice, step);
    if (amount <= 0) return { ok: false, index, error: "amountZero" };
    lines.push({ ...input, label: input.label.trim(), lineAmount: amount });
  }
  return { ok: true, lines, total: sumAmounts(lines.map((l) => l.lineAmount)) };
}

// ---------------------------------------------------------------------------
// Annulation (RG1)
// ---------------------------------------------------------------------------

export type CancellationPath = "direct" | "request" | "none";

/**
 * Comment l'utilisateur peut annuler une opération :
 * - « direct » : propriétaire ; ou gérant, pour SA propre opération, dans le délai (heure du serveur) ;
 * - « request » : gérant hors délai ou opération d'un autre → demande au propriétaire ;
 * - « none » : comptable, annulation, opération déjà annulée.
 * La base applique la même règle (cancel_operation) : ceci sert à l'interface.
 */
export function cancellationPath(input: {
  role: "owner" | "manager" | "accountant" | "platformAdmin" | null;
  userId: string;
  operation: Pick<LedgerOperation, "kind" | "authorId" | "serverCreatedAt">;
  alreadyCancelled: boolean;
  now: Date;
  windowMinutes: number;
}): CancellationPath {
  const { role, operation } = input;
  if (operation.kind === "cancellation" || input.alreadyCancelled) return "none";
  if (role === "owner") return "direct";
  if (role !== "manager") return "none";
  const elapsedMs = input.now.getTime() - new Date(operation.serverCreatedAt).getTime();
  const withinWindow = elapsedMs <= input.windowMinutes * 60_000;
  return operation.authorId === input.userId && withinWindow ? "direct" : "request";
}
