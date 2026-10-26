// Moteur de synchronisation : file d'envoi idempotente (dans l'ordre) + téléchargement incrémental.
import { advanceCursor, classifyOutcome, isCustomerCommand, pullFrom, retryDelay, toCancellationRequest, type OutboxCommand, type OutboxEntry, type RpcErrorLike } from "../domain/sync";
import type { LocalCustomer, LocalDatabase, LocalLine, LocalMovement, LocalOperation, LocalPackage, LocalProduct, LocalProfile, LocalRequest, LocalReview, LocalShop } from "./local-db";

export interface PullCursors {
  customers: string | null;
  operations: string | null;
  requests: string | null;
}

export interface PullResult {
  customers: LocalCustomer[];
  operations: LocalOperation[];
  lines: LocalLine[];
  requests: LocalRequest[];
  shop: LocalShop | null;
  profiles: LocalProfile[];
  /** Catalogue complet de la boutique (petit : téléchargé à chaque passage). */
  products?: LocalProduct[];
  /** Stock courant, derniers mouvements et bilans (petits : remplacés à chaque passage). */
  packages?: LocalPackage[];
  movements?: LocalMovement[];
  reviews?: LocalReview[];
  /** Horodatages serveur vus, pour avancer les curseurs. */
  seen: { customers: string[]; operations: string[]; requests: string[] };
}

/** Accès au serveur (Supabase en production, faux serveur dans les tests). */
export interface SyncTransport {
  send(entry: OutboxEntry): Promise<RpcErrorLike | null>;
  pullShop(shopId: string, from: PullCursors): Promise<PullResult>;
}

export interface SyncStatus {
  online: boolean;
  syncing: boolean;
  pending: number;
  rejected: number;
  lastSyncAt: string | null;
}

export interface EngineOptions {
  userId: string;
  shopIds: string[];
  isOnline?: () => boolean;
  now?: () => number;
  newId?: () => string;
  /** Relance automatiquement l'envoi à la fin du délai de nouvelle tentative (navigateur). */
  autoRetry?: boolean;
}

export class SyncEngine {
  private status: SyncStatus = { online: true, syncing: false, pending: 0, rejected: 0, lastSyncAt: null };
  private listeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly isOnline: () => boolean;
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(
    readonly db: LocalDatabase,
    private readonly transport: SyncTransport,
    private readonly options: EngineOptions,
  ) {
    this.isOnline = options.isOnline ?? (() => true);
    this.now = options.now ?? (() => Date.now());
    this.newId = options.newId ?? (() => crypto.randomUUID());
  }

  // --- état pour l'interface (useSyncExternalStore) ---

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getStatus = (): SyncStatus => this.status;

  private setStatus(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch };
    for (const listener of this.listeners) listener();
  }

  async refreshCounts(): Promise<void> {
    const [pending, rejected, last] = await Promise.all([
      this.db.outbox.where("status").equals("pending").count(),
      this.db.outbox.where("status").equals("rejected").count(),
      this.db.meta.get("lastSyncAt"),
    ]);
    this.setStatus({ pending, rejected, lastSyncAt: last?.value ?? null, online: this.isOnline() });
  }

  // --- saisie locale ---

  /** Écrit la saisie sur l'appareil (l'interface réagit tout de suite), puis tente l'envoi. */
  async enqueue(command: OutboxCommand, id: string = this.newId()): Promise<OutboxEntry> {
    const entry: OutboxEntry = {
      id,
      command,
      authorId: this.options.userId,
      deviceCreatedAt: new Date(this.now()).toISOString(),
      status: "pending",
      attempts: 0,
      nextAttemptAt: 0,
    };
    await this.db.transaction("rw", this.db.outbox, this.db.customers, async () => {
      if (await this.db.outbox.where("id").equals(id).count()) return; // double clic : une seule saisie
      await this.db.outbox.add(entry);
      if (command.type === "customer.create") {
        const c = command.customer;
        await this.db.customers.put({ ...c, archived: false, updatedAt: null, localOnly: true });
      }
    });
    await this.refreshCounts();
    void this.sync();
    return entry;
  }

  /** L'utilisateur a pris connaissance d'un refus : on retire l'entrée (jamais sans son action). */
  async dismissRejected(id: string): Promise<void> {
    const entry = await this.db.outbox.where("id").equals(id).first();
    if (entry?.status === "rejected" && entry.seq !== undefined) {
      await this.db.outbox.delete(entry.seq);
      if (entry.command.type === "customer.create") await this.db.customers.delete(entry.command.customer.id);
    }
    await this.refreshCounts();
  }

  // --- synchronisation ---

  /** Envoie la file puis télécharge. Un seul passage à la fois ; un appel pendant un passage attend puis relance. */
  sync(): Promise<void> {
    if (this.running) return this.running.then(() => this.sync());
    const run = async () => {
      try {
        if (!this.isOnline()) return;
        this.setStatus({ syncing: true, online: true });
        await this.push();
        await this.pull();
      } catch {
        // Réseau coupé pendant le passage : rien n'est perdu (la file reste), on réessaiera.
      } finally {
        this.setStatus({ syncing: false });
        await this.refreshCounts();
        if (this.options.autoRetry) await this.scheduleRetry();
      }
    };
    // Libéré après l'assignation (un passage hors ligne se termine avant même d'être assigné).
    const current = run().finally(() => {
      if (this.running === current) this.running = null;
    });
    this.running = current;
    return current;
  }

  /** Programme le prochain envoi à l'échéance de la saisie en attente la plus proche. */
  private async scheduleRetry(): Promise<void> {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const next = await this.db.outbox.where("status").equals("pending").toArray();
    if (!next.length) return;
    const due = Math.min(...next.map((e) => e.nextAttemptAt));
    this.retryTimer = setTimeout(() => void this.sync(), Math.max(1_000, due - this.now()));
  }

  /** Envoie les saisies en attente dans l'ordre ; s'arrête au premier échec réseau (l'ordre est préservé). */
  async push(): Promise<void> {
    const entries = await this.db.outbox.orderBy("seq").toArray();
    for (const entry of entries) {
      if (entry.status !== "pending") continue;
      if (entry.nextAttemptAt > this.now()) return;
      let error: RpcErrorLike | null;
      try {
        error = await this.transport.send(entry);
      } catch (e) {
        error = { message: e instanceof Error ? e.message : String(e) };
      }
      const outcome = classifyOutcome(entry.command, error);
      if (outcome.kind === "retry") {
        await this.db.outbox.update(entry.seq!, { attempts: entry.attempts + 1, nextAttemptAt: this.now() + retryDelay(entry.attempts + 1) });
        return;
      }
      if (outcome.kind === "reject") {
        await this.db.outbox.update(entry.seq!, { status: "rejected", error: outcome.code });
        continue;
      }
      if (outcome.kind === "convertToRequest") {
        const request = toCancellationRequest(entry, this.newId());
        await this.db.outbox.update(entry.seq!, { id: request.id, command: request.command, attempts: 0, nextAttemptAt: 0 });
        return this.push();
      }
      await this.confirm(entry);
    }
  }

  /** Envoi réussi : l'entrée quitte la file ; une copie provisoire évite un « trou » jusqu'au téléchargement. */
  private async confirm(entry: OutboxEntry) {
    const c = entry.command;
    await this.db.transaction("rw", [this.db.outbox, this.db.operations, this.db.lines, this.db.customers], async () => {
      await this.db.outbox.delete(entry.seq!);
      if (c.type === "customer.create") {
        await this.db.customers.update(c.customer.id, { localOnly: false });
        return;
      }
      if (c.type === "request" || c.type === "stock.request") return;
      if (c.type.startsWith("stock.")) {
        // Vente entière sur compte : la prise reste visible jusqu'au téléchargement.
        if (c.type === "stock.sell" && c.customerId && c.takeId && !(await this.db.operations.get(c.takeId))) {
          await this.db.operations.put({
            id: c.takeId,
            shopId: c.shopId,
            customerId: c.customerId,
            kind: "take",
            amount: c.price,
            cancelsOperationId: null,
            authorId: entry.authorId,
            deviceCreatedAt: entry.deviceCreatedAt,
            serverCreatedAt: new Date(this.now()).toISOString(),
            provisional: true,
            note: null,
            takeMode: "detailed",
            paymentMethodId: null,
            cancellationReason: null,
          });
        }
        return;
      }
      if (!isCustomerCommand(c)) return;
      const base = {
        id: entry.id,
        shopId: c.shopId,
        customerId: c.customerId,
        authorId: entry.authorId,
        deviceCreatedAt: entry.deviceCreatedAt,
        serverCreatedAt: new Date(this.now()).toISOString(),
        provisional: true,
        note: null,
        takeMode: null,
        paymentMethodId: null,
        cancellationReason: null,
      };
      if (await this.db.operations.get(entry.id)) return;
      if (c.type === "take") {
        await this.db.operations.put({ ...base, kind: "take", amount: c.amount, cancelsOperationId: null, takeMode: c.mode, note: c.note });
        await this.db.lines.bulkPut(
          c.lines.map((l, position) => ({
            id: `${entry.id}-${position}`,
            operationId: entry.id,
            position,
            label: l.label,
            quantityMilli: l.quantity_milli,
            unit: l.unit,
            unitPrice: l.unit_price,
            lineAmount: l.line_amount,
            formatLabel: l.format_label ?? null,
            formatCount: l.format_count ?? null,
          })),
        );
      } else if (c.type === "payment") {
        await this.db.operations.put({ ...base, kind: "payment", amount: c.amount, cancelsOperationId: null, paymentMethodId: c.paymentMethodId, note: c.note });
      } else {
        await this.db.operations.put({ ...base, kind: "cancellation", amount: null, cancelsOperationId: c.operationId, cancellationReason: c.reason });
      }
    });
  }

  /** Télécharge, boutique par boutique, ce qui a changé depuis les curseurs. */
  async pull(): Promise<void> {
    for (const shopId of this.options.shopIds) {
      const cursors = await this.cursors(shopId);
      const result = await this.transport.pullShop(shopId, {
        customers: pullFrom(cursors.customers),
        operations: pullFrom(cursors.operations),
        requests: pullFrom(cursors.requests),
      });
      await this.db.transaction("rw", [this.db.customers, this.db.operations, this.db.lines, this.db.requests, this.db.shops, this.db.profiles, this.db.products, this.db.packages, this.db.movements, this.db.reviews, this.db.meta], async () => {
        await this.db.customers.bulkPut(result.customers);
        await this.db.operations.bulkPut(result.operations.map((op) => ({ ...op, provisional: false })));
        // Lignes provisoires (identifiant local) remplacées par celles du serveur.
        const opIds = result.lines.map((l) => l.operationId);
        if (opIds.length) await this.db.lines.where("operationId").anyOf(opIds).delete();
        await this.db.lines.bulkPut(result.lines);
        await this.db.requests.bulkPut(result.requests);
        if (result.shop) await this.db.shops.put(result.shop);
        await this.db.profiles.bulkPut(result.profiles);
        if (result.products) {
          await this.db.products.where("shopId").equals(shopId).delete();
          await this.db.products.bulkPut(result.products);
        }
        if (result.packages) {
          await this.db.packages.where("shopId").equals(shopId).delete();
          await this.db.packages.bulkPut(result.packages);
        }
        if (result.movements) {
          await this.db.movements.where("shopId").equals(shopId).delete();
          await this.db.movements.bulkPut(result.movements);
        }
        if (result.reviews) {
          await this.db.reviews.where("shopId").equals(shopId).delete();
          await this.db.reviews.bulkPut(result.reviews);
        }
        await this.db.meta.bulkPut([
          { key: `cursor:${shopId}:customers`, value: advanceCursor(cursors.customers, result.seen.customers) },
          { key: `cursor:${shopId}:operations`, value: advanceCursor(cursors.operations, result.seen.operations) },
          { key: `cursor:${shopId}:requests`, value: advanceCursor(cursors.requests, result.seen.requests) },
        ]);
      });
    }
    await this.db.meta.put({ key: "lastSyncAt", value: new Date(this.now()).toISOString() });
  }

  private async cursors(shopId: string): Promise<PullCursors> {
    const rows = await this.db.meta.bulkGet([`cursor:${shopId}:customers`, `cursor:${shopId}:operations`, `cursor:${shopId}:requests`]);
    return { customers: rows[0]?.value ?? null, operations: rows[1]?.value ?? null, requests: rows[2]?.value ?? null };
  }

  /** Oublie les données des boutiques qui ne sont plus accessibles (rattachement retiré). */
  async forgetOtherShops(): Promise<void> {
    const keep = new Set(this.options.shopIds);
    await this.db.transaction("rw", [this.db.customers, this.db.operations, this.db.requests, this.db.shops, this.db.products, this.db.packages, this.db.movements, this.db.reviews], async () => {
      await this.db.products.filter((p) => !keep.has(p.shopId)).delete();
      await this.db.packages.filter((p) => !keep.has(p.shopId)).delete();
      await this.db.movements.filter((m) => !keep.has(m.shopId)).delete();
      await this.db.reviews.filter((r) => !keep.has(r.shopId)).delete();
      await this.db.customers.filter((c) => !keep.has(c.shopId)).delete();
      await this.db.operations.filter((o) => !keep.has(o.shopId)).delete();
      await this.db.requests.filter((r) => !keep.has(r.shopId)).delete();
      await this.db.shops.filter((s) => !keep.has(s.shopId)).delete();
    });
  }
}
