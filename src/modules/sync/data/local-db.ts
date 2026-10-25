// Base locale de l'appareil (IndexedDB via Dexie). Une base par utilisateur, effacée à la déconnexion.
import Dexie, { type Table } from "dexie";
import type { Amount } from "@/shared/domain";
import type { LedgerOperation } from "@/modules/ledger";
import type { OutboxEntry } from "../domain/sync";

export interface LocalCustomer {
  id: string;
  shopId: string;
  fullName: string;
  phone: string | null;
  type: "advance" | "monthly" | "free";
  creditLimit: Amount | null;
  alertThreshold: Amount | null;
  monthlyDueDay: number | null;
  note: string | null;
  archived: boolean;
  updatedAt: string | null;
  /** Créé sur l'appareil, pas encore confirmé par le serveur. */
  localOnly?: boolean;
}

export interface LocalOperation extends LedgerOperation {
  shopId: string;
  customerId: string;
  takeMode: "quick" | "detailed" | null;
  note: string | null;
  paymentMethodId: string | null;
  cancellationReason: string | null;
  /** Écrit localement après un envoi réussi, en attendant le prochain téléchargement. */
  provisional?: boolean;
}

export interface LocalLine {
  id: string;
  operationId: string;
  position: number;
  label: string;
  quantityMilli: number;
  unit: string;
  unitPrice: Amount;
  lineAmount: Amount;
}

export interface LocalRequest {
  id: string;
  shopId: string;
  /** Opération client visée, ou null pour une demande sur un mouvement de stock. */
  operationId: string | null;
  stockMovementId?: string | null;
  status: "pending" | "approved" | "rejected";
  reason: string;
  requestedBy: string;
  decisionNote: string | null;
}

export interface LocalShop {
  shopId: string;
  settings: {
    cancelWindowMinutes: number;
    roundingStep: 1 | 5 | 25;
    advanceAlertThreshold: Amount;
    freeCreditReminderDays: number;
    monthlyDueDay: number | null;
  };
  paymentMethods: { id: string; kind: "cash" | "wave" | "orange_money" | "other" | "custom"; label: string | null; active: boolean }[];
}

export interface LocalProduct {
  id: string;
  shopId: string;
  name: string;
  category: string | null;
  packageLabel: string;
  saleUnit: "kg" | "l" | "piece" | "sachet";
  capacityMilli: number;
  reorderThreshold: number;
  archived: boolean;
  /** Grille en vigueur (dernier prix connu, utilisé hors ligne : RG3). */
  retailPrice: Amount | null;
  packagePrice: Amount | null;
  formats: { id?: string; label: string; quantityMilli: number; price: Amount }[];
  pendingRetailPrice: Amount | null;
}

export interface LocalPackage {
  id: string;
  shopId: string;
  productId: string;
  lotId: string;
  state: "closed" | "opened";
  openedAt: string | null;
  remainingEstimate: number | null;
}

export interface LocalMovement {
  id: string;
  shopId: string;
  productId: string;
  kind: "reception" | "open" | "finish" | "whole_sale" | "adjustment" | "estimate" | "cancellation";
  quantity: number | null;
  amount: Amount | null;
  reason: string | null;
  cancelsMovementId: string | null;
  customerOperationId: string | null;
  authorId: string;
  deviceCreatedAt: string;
  serverCreatedAt: string;
}

export interface LocalReview {
  packageId: string;
  shopId: string;
  productId: string;
  openedAt: string | null;
  finishedAt: string | null;
  expectedRevenue: Amount;
  accountTakes: Amount;
  estimatedCashSales: Amount;
  cost: Amount;
  grossMargin: Amount;
}

export interface LocalProfile {
  userId: string;
  fullName: string;
}

export interface MetaRow {
  key: string;
  value: string | null;
}

export class LocalDatabase extends Dexie {
  customers!: Table<LocalCustomer, string>;
  operations!: Table<LocalOperation, string>;
  lines!: Table<LocalLine, string>;
  requests!: Table<LocalRequest, string>;
  shops!: Table<LocalShop, string>;
  profiles!: Table<LocalProfile, string>;
  products!: Table<LocalProduct, string>;
  packages!: Table<LocalPackage, string>;
  movements!: Table<LocalMovement, string>;
  reviews!: Table<LocalReview, string>;
  outbox!: Table<OutboxEntry, number>;
  meta!: Table<MetaRow, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      customers: "id, shopId",
      operations: "id, shopId, customerId",
      lines: "id, operationId",
      requests: "id, shopId, operationId",
      shops: "shopId",
      profiles: "userId",
      outbox: "++seq, &id, status",
      meta: "key",
    });
    // Jalon 5 : catalogue et prix sur l'appareil.
    this.version(2).stores({ products: "id, shopId" });
    // Jalon 5b : stock courant, derniers mouvements et bilans de sac.
    this.version(3).stores({ packages: "id, shopId, productId", movements: "id, shopId, productId", reviews: "packageId, shopId, productId" });
  }
}

export function localDatabaseName(userId: string): string {
  return `bitig-${userId}`;
}
