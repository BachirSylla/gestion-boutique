// Synchronisation hors ligne : règles pures (aucune dépendance au navigateur ni au réseau).
// Voir docs/decisions/0011-synchronisation-hors-ligne.md.
import type { Amount } from "@/shared/domain";
import type { LedgerOperation } from "@/modules/ledger";

// ---------------------------------------------------------------------------
// File d'envoi
// ---------------------------------------------------------------------------

export interface TakeLinePayload {
  label: string;
  product_id?: string | null;
  format_label?: string | null;
  format_count?: number | null;
  quantity_milli: number;
  unit: string;
  unit_price: Amount;
  line_amount: Amount;
}

export type OutboxCommand =
  | {
      type: "customer.create";
      customer: {
        id: string;
        shopId: string;
        fullName: string;
        phone: string | null;
        type: "advance" | "monthly" | "free";
        creditLimit: Amount | null;
        alertThreshold: Amount | null;
        monthlyDueDay: number | null;
        note: string | null;
      };
    }
  | { type: "take"; customerId: string; shopId: string; mode: "quick" | "detailed"; amount: Amount; note: string | null; lines: TakeLinePayload[] }
  | { type: "payment"; customerId: string; shopId: string; amount: Amount; paymentMethodId: string; note: string | null }
  | { type: "cancel"; customerId: string; shopId: string; operationId: string; reason: string | null; fallbackReason: string }
  | { type: "request"; customerId: string; shopId: string; operationId: string; reason: string };

export interface OutboxEntry {
  /** Identifiant de l'opération, généré sur l'appareil (clé d'idempotence côté serveur). */
  id: string;
  /** Ordre d'envoi (croissant). */
  seq?: number;
  command: OutboxCommand;
  authorId: string;
  deviceCreatedAt: string;
  status: "pending" | "rejected";
  attempts: number;
  nextAttemptAt: number;
  /** Code d'erreur métier en cas de refus (affiché, jamais effacé sans action de l'utilisateur). */
  error?: string;
}

// ---------------------------------------------------------------------------
// Décision après un envoi
// ---------------------------------------------------------------------------

export interface RpcErrorLike {
  code?: string;
  message?: string;
  status?: number;
}

export type SendOutcome =
  | { kind: "done" }
  /** Réseau, serveur indisponible, session à renouveler : on réessaiera, dans le même ordre. */
  | { kind: "retry" }
  /** Refus métier ou de droits : visible par l'utilisateur, jamais perdu en silence. */
  | { kind: "reject"; code: string }
  /** Annulation arrivée hors délai : devient une demande d'annulation au propriétaire. */
  | { kind: "convertToRequest" };

const REJECT_CODES = /^(42501|BT00[0-9]|23\d{3}|22\d{3}|P0001|P0002|PGRST1\d\d)$/;

export function classifyOutcome(command: OutboxCommand, error: RpcErrorLike | null): SendOutcome {
  if (!error) return { kind: "done" };
  const code = error.code ?? "";
  if (command.type === "cancel" && code === "BT001") return { kind: "convertToRequest" };
  // Déjà en attente / déjà annulée : l'effet voulu est atteint, rien à refaire.
  if ((command.type === "request" && code === "BT006") || (command.type === "cancel" && code === "BT002")) return { kind: "done" };
  if (REJECT_CODES.test(code)) return { kind: "reject", code };
  return { kind: "retry" };
}

/** Délai avant une nouvelle tentative : 2 s, 4 s, 8 s… plafonné à 60 s. */
export function retryDelay(attempts: number): number {
  return Math.min(60_000, 2_000 * 2 ** Math.max(0, attempts - 1));
}

/** Transforme une annulation hors délai en demande (motif de l'utilisateur, sinon motif par défaut). */
export function toCancellationRequest(entry: OutboxEntry, newId: string): OutboxEntry {
  if (entry.command.type !== "cancel") return entry;
  const { customerId, shopId, operationId, reason, fallbackReason } = entry.command;
  return {
    ...entry,
    id: newId,
    attempts: 0,
    nextAttemptAt: 0,
    command: { type: "request", customerId, shopId, operationId, reason: reason && reason.trim().length >= 3 ? reason : fallbackReason },
  };
}

// ---------------------------------------------------------------------------
// Curseurs de téléchargement
// ---------------------------------------------------------------------------

/** Recouvrement : une transaction lente peut valider une ligne d'horodatage antérieur au curseur. */
export const CURSOR_OVERLAP_MS = 5 * 60_000;

/** Borne basse de la requête incrémentale (curseur moins le recouvrement), ou null pour tout télécharger. */
export function pullFrom(cursor: string | null): string | null {
  if (!cursor) return null;
  return new Date(new Date(cursor).getTime() - CURSOR_OVERLAP_MS).toISOString();
}

/** Nouveau curseur : le plus grand horodatage vu (jamais en arrière). */
export function advanceCursor(cursor: string | null, timestamps: readonly (string | null | undefined)[]): string | null {
  return timestamps.reduce<string | null>((max, t) => (t && (!max || t > max) ? t : max), cursor);
}

// ---------------------------------------------------------------------------
// Projection : journal du serveur + saisies en attente → ce que l'écran affiche
// ---------------------------------------------------------------------------

export interface ViewOperation extends LedgerOperation {
  /** Saisie encore dans la file d'envoi (pas confirmée par le serveur). */
  pending: boolean;
  /** Refusée par le serveur : affichée, exclue du solde. */
  rejected: boolean;
}

/** Fusionne les opérations confirmées et les saisies locales d'un client (les doublons d'identifiant sont ignorés). */
export function mergeOperations(server: readonly LedgerOperation[], outbox: readonly OutboxEntry[], customerId?: string): ViewOperation[] {
  const known = new Set(server.map((op) => op.id));
  const local: ViewOperation[] = [];
  for (const entry of outbox) {
    const c = entry.command;
    if (c.type === "customer.create" || c.type === "request" || known.has(entry.id)) continue;
    if (customerId && c.customerId !== customerId) continue;
    const base = {
      id: entry.id,
      authorId: entry.authorId,
      deviceCreatedAt: entry.deviceCreatedAt,
      // Pas encore reçu par le serveur : le délai d'annulation se comptera à sa réception.
      serverCreatedAt: entry.deviceCreatedAt,
      pending: entry.status === "pending",
      rejected: entry.status === "rejected",
    };
    if (c.type === "take" || c.type === "payment") local.push({ ...base, kind: c.type, amount: c.amount, cancelsOperationId: null });
    else local.push({ ...base, kind: "cancellation", amount: null, cancelsOperationId: c.operationId });
  }
  return [...server.map((op) => ({ ...op, pending: false, rejected: false })), ...local];
}

/** Opérations qui comptent dans le solde : les refusées sont exclues. */
export function countedOperations(operations: readonly ViewOperation[]): ViewOperation[] {
  return operations.filter((op) => !op.rejected);
}

/** Demandes d'annulation en attente côté appareil (pour masquer le bouton et afficher « en attente »). */
export function pendingRequestTargets(outbox: readonly OutboxEntry[]): Set<string> {
  return new Set(outbox.filter((e) => e.command.type === "request" && e.status === "pending").map((e) => (e.command as { operationId: string }).operationId));
}

export type SyncState = "synced" | "pending" | "offline" | "rejected";

/** État résumé pour l'indicateur. */
export function syncState(input: { online: boolean; pending: number; rejected: number }): SyncState {
  if (input.rejected > 0) return "rejected";
  if (!input.online) return "offline";
  return input.pending > 0 ? "pending" : "synced";
}

// ---------------------------------------------------------------------------
// Résumé par client (liste, accueil) à partir du journal local et de la file
// ---------------------------------------------------------------------------

export interface CustomerSummary {
  balance: Amount;
  totalTaken: Amount;
  totalPaid: Amount;
  lastPaymentAt: string | null;
  firstTakeAt: string | null;
  lastOperationAt: string | null;
  pending: number;
}

/** Solde et dates par client (opérations annulées et saisies refusées exclues). */
export function summarizeByCustomer(operations: readonly (LedgerOperation & { customerId: string })[], outbox: readonly OutboxEntry[]): Map<string, CustomerSummary> {
  const byCustomer = new Map<string, LedgerOperation[]>();
  for (const op of operations) byCustomer.set(op.customerId, [...(byCustomer.get(op.customerId) ?? []), op]);
  for (const entry of outbox) {
    const c = entry.command;
    if (c.type !== "customer.create" && !byCustomer.has(c.customerId)) byCustomer.set(c.customerId, []);
  }
  const result = new Map<string, CustomerSummary>();
  for (const [customerId, ops] of byCustomer) {
    const merged = countedOperations(mergeOperations(ops, outbox, customerId));
    const cancelled = new Set(merged.filter((o) => o.kind === "cancellation").map((o) => o.cancelsOperationId));
    const live = merged.filter((o) => o.kind !== "cancellation" && !cancelled.has(o.id));
    const totalTaken = live.filter((o) => o.kind === "take").reduce((s, o) => s + (o.amount ?? 0), 0);
    const totalPaid = live.filter((o) => o.kind === "payment").reduce((s, o) => s + (o.amount ?? 0), 0);
    const dates = (kind: string) => live.filter((o) => o.kind === kind).map((o) => o.deviceCreatedAt).sort();
    result.set(customerId, {
      balance: totalPaid - totalTaken,
      totalTaken,
      totalPaid,
      lastPaymentAt: dates("payment").at(-1) ?? null,
      firstTakeAt: dates("take")[0] ?? null,
      lastOperationAt: merged.map((o) => o.deviceCreatedAt).sort().at(-1) ?? null,
      pending: merged.filter((o) => o.pending).length,
    });
  }
  return result;
}

/** Message à afficher pour un refus du serveur (code d'erreur → clé de traduction « errors.* »). */
export function rejectionMessage(code: string | undefined): "forbidden" | "customerArchived" | "invalidInput" | "alreadyCancelled" | "requestPending" | "unexpected" {
  switch (code) {
    case "42501":
      return "forbidden";
    case "BT003":
      return "customerArchived";
    case "BT002":
      return "alreadyCancelled";
    case "BT006":
      return "requestPending";
    case "BT004":
    case "BT005":
    case "23514":
    case "23503":
      return "invalidInput";
    default:
      return "unexpected";
  }
}
