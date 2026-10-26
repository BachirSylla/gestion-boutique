import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OutboxCommand, OutboxEntry, RpcErrorLike } from "../domain/sync";
import { SyncEngine, type PullResult, type SyncTransport } from "./engine";
import { LocalDatabase, type LocalClosing, type LocalOperation } from "./local-db";

const take = (amount: number): OutboxCommand => ({ type: "take", customerId: "awa", shopId: "s1", mode: "quick", amount, note: null, lines: [] });

/**
 * Faux serveur : applique l'idempotence comme la base (un identifiant déjà connu ne crée rien)
 * et peut simuler des pannes réseau, y compris « l'opération est enregistrée mais la réponse se perd ».
 */
class FakeServer implements SyncTransport {
  operations = new Map<string, LocalOperation>();
  closings = new Map<string, LocalClosing>();
  sends: string[] = [];
  failNext: "network" | "lostResponse" | RpcErrorLike | null = null;
  rejectCodes = new Map<string, string>(); // id → code d'erreur métier

  async send(entry: OutboxEntry): Promise<RpcErrorLike | null> {
    this.sends.push(entry.id);
    const failure = this.failNext;
    this.failNext = null;
    if (failure === "network") return { message: "Failed to fetch" };
    const code = this.rejectCodes.get(entry.id);
    if (code) return { code };
    if (failure && failure !== "lostResponse") return failure;
    const c = entry.command;
    if (c.type === "take" && !this.operations.has(entry.id)) {
      this.operations.set(entry.id, {
        id: entry.id,
        kind: "take",
        amount: c.amount,
        cancelsOperationId: null,
        authorId: entry.authorId,
        deviceCreatedAt: entry.deviceCreatedAt,
        serverCreatedAt: new Date().toISOString(),
        shopId: c.shopId,
        customerId: c.customerId,
        takeMode: c.mode,
        note: c.note,
        paymentMethodId: null,
        cancellationReason: null,
      });
    }
    if (c.type === "cash.close" && !this.closings.has(entry.id)) {
      const totalReceived = c.amounts.reduce((sum, a) => sum + a.amount, 0);
      this.closings.set(entry.id, { id: entry.id, shopId: c.shopId, businessDate: c.businessDate, totalReceived, amounts: c.amounts, note: c.note, authorId: entry.authorId, deviceCreatedAt: entry.deviceCreatedAt, serverCreatedAt: new Date().toISOString() });
    }
    return failure === "lostResponse" ? { message: "Network request failed" } : null;
  }

  async pullShop(): Promise<PullResult> {
    const operations = [...this.operations.values()];
    return { customers: [], operations, lines: [], requests: [], shop: null, profiles: [], closings: [...this.closings.values()], seen: { customers: [], operations: operations.map((o) => o.serverCreatedAt), requests: [] } };
  }
}

let db: LocalDatabase;
let server: FakeServer;
let clock: number;
let online: boolean;
let engine: SyncEngine;

beforeEach(() => {
  db = new LocalDatabase(`test-${crypto.randomUUID()}`);
  server = new FakeServer();
  clock = Date.parse("2026-10-25T09:00:00Z");
  online = true;
  engine = new SyncEngine(db, server, { userId: "moussa", shopIds: ["s1"], isOnline: () => online, now: () => clock });
});

afterEach(async () => {
  await db.delete();
});

describe("SyncEngine", () => {
  it("hors ligne : la saisie reste sur l'appareil, puis part au retour du réseau", async () => {
    online = false;
    await engine.enqueue(take(2500), "op-1");
    expect(await db.outbox.count()).toBe(1);
    expect(server.sends).toEqual([]);
    expect(engine.getStatus()).toMatchObject({ pending: 1, online: false });

    online = true;
    await engine.sync();
    expect(await db.outbox.count()).toBe(0);
    expect(server.operations.size).toBe(1);
    expect(await db.operations.get("op-1")).toMatchObject({ amount: 2500, provisional: false });
    expect(engine.getStatus()).toMatchObject({ pending: 0 });
  });

  it("réponse perdue : le renvoi ne crée pas de doublon", async () => {
    server.failNext = "lostResponse"; // enregistrée côté serveur, mais l'appareil ne le sait pas
    await engine.enqueue(take(1000), "op-2");
    await engine.sync();
    expect(await db.outbox.count()).toBe(1); // l'appareil réessaiera
    expect(server.operations.size).toBe(1);

    clock += 60_000; // après le délai de nouvelle tentative
    await engine.sync();
    expect(server.sends).toEqual(["op-2", "op-2"]);
    expect(server.operations.size).toBe(1); // toujours une seule opération
    expect(await db.outbox.count()).toBe(0);
  });

  it("panne réseau : on garde l'ordre et on attend le délai avant de réessayer", async () => {
    online = false;
    await engine.enqueue(take(100), "op-a");
    await engine.enqueue(take(200), "op-b");
    online = true;
    server.failNext = "network";
    await engine.sync();
    expect(server.sends).toEqual(["op-a"]); // op-b n'est pas envoyée avant op-a
    await engine.sync();
    expect(server.sends).toEqual(["op-a"]); // délai pas écoulé
    clock += 2_000;
    await engine.sync();
    expect(server.sends).toEqual(["op-a", "op-a", "op-b"]);
    expect([...server.operations.keys()]).toEqual(["op-a", "op-b"]);
  });

  it("refus du serveur : la saisie reste visible, marquée refusée, jusqu'à ce que l'utilisateur la retire", async () => {
    server.rejectCodes.set("op-3", "BT003");
    await engine.enqueue(take(500), "op-3");
    await engine.enqueue(take(700), "op-4");
    await engine.sync();
    expect(await db.outbox.where("id").equals("op-3").first()).toMatchObject({ status: "rejected", error: "BT003" });
    expect(server.operations.has("op-4")).toBe(true); // la suite n'est pas bloquée
    expect(engine.getStatus()).toMatchObject({ rejected: 1, pending: 0 });
    await engine.dismissRejected("op-3");
    expect(await db.outbox.count()).toBe(0);
  });

  it("annulation hors délai : devient une demande d'annulation, envoyée aussitôt", async () => {
    server.rejectCodes.set("c-1", "BT001");
    const ids = ["r-1"];
    engine = new SyncEngine(db, server, { userId: "moussa", shopIds: ["s1"], isOnline: () => online, now: () => clock, newId: () => ids.shift()! });
    await engine.enqueue({ type: "cancel", customerId: "awa", shopId: "s1", operationId: "op-9", reason: null, fallbackReason: "Arrivée hors délai" }, "c-1");
    await engine.sync();
    expect(server.sends).toEqual(["c-1", "r-1"]);
    expect(await db.outbox.count()).toBe(0);
  });

  it("double clic : une seule saisie pour un même identifiant", async () => {
    online = false;
    await engine.enqueue(take(300), "op-5");
    await engine.enqueue(take(300), "op-5");
    expect(await db.outbox.count()).toBe(1);
  });

  it("un client créé hors ligne apparaît tout de suite, marqué local", async () => {
    online = false;
    const customer = { id: "c-new", shopId: "s1", fullName: "Cheikh Diop", phone: null, type: "free" as const, creditLimit: null, alertThreshold: null, monthlyDueDay: null, note: null };
    await engine.enqueue({ type: "customer.create", customer }, "c-new");
    expect(await db.customers.get("c-new")).toMatchObject({ fullName: "Cheikh Diop", localOnly: true });
  });
});

describe("clôture de journée hors ligne (RG7)", () => {
  it("saisie sans réseau, réponse perdue au premier envoi : une seule clôture, visible tout du long", async () => {
    online = false;
    const command: OutboxCommand = {
      type: "cash.close",
      shopId: "s1",
      businessDate: "2026-10-25",
      amounts: [
        { paymentMethodId: "cash", amount: 40_000 },
        { paymentMethodId: "wave", amount: 15_000 },
      ],
      note: null,
    };
    await engine.enqueue(command);
    expect(await db.outbox.count()).toBe(1);
    online = true;
    server.failNext = "lostResponse";
    await engine.sync();
    clock += 60 * 60_000;
    await engine.sync();
    expect(server.closings.size).toBe(1);
    expect(await db.outbox.count()).toBe(0);
    const local = await db.closings.toArray();
    expect(local).toHaveLength(1);
    expect(local[0]).toMatchObject({ businessDate: "2026-10-25", totalReceived: 55_000 });
  });
});
