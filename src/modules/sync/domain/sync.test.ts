import { describe, expect, it } from "vitest";
import { computeBalance, type LedgerOperation } from "@/modules/ledger";
import {
  advanceCursor,
  classifyOutcome,
  countedOperations,
  mergeOperations,
  pendingRequestTargets,
  pullFrom,
  rejectionMessage,
  summarizeByCustomer,
  retryDelay,
  syncState,
  toCancellationRequest,
  type OutboxCommand,
  type OutboxEntry,
} from "./sync";

const take: OutboxCommand = { type: "take", customerId: "awa", shopId: "s1", mode: "quick", amount: 2500, note: null, lines: [] };
const cancel: OutboxCommand = { type: "cancel", customerId: "awa", shopId: "s1", operationId: "op-1", reason: null, fallbackReason: "Annulation hors ligne arrivée hors délai" };

function entry(id: string, command: OutboxCommand, extra: Partial<OutboxEntry> = {}): OutboxEntry {
  return { id, command, authorId: "moussa", deviceCreatedAt: "2026-10-25T09:00:00Z", status: "pending", attempts: 0, nextAttemptAt: 0, ...extra };
}

function serverOp(id: string, kind: LedgerOperation["kind"], amount: number | null, cancels: string | null = null): LedgerOperation {
  return { id, kind, amount, cancelsOperationId: cancels, authorId: "moussa", deviceCreatedAt: "2026-10-24T09:00:00Z", serverCreatedAt: "2026-10-24T09:00:01Z" };
}

describe("classifyOutcome", () => {
  it("succès, y compris un renvoi déjà connu (le serveur répond « duplicate » sans erreur)", () => {
    expect(classifyOutcome(take, null)).toEqual({ kind: "done" });
  });

  it("réseau ou serveur indisponible : on réessaiera", () => {
    expect(classifyOutcome(take, { message: "TypeError: Failed to fetch" })).toEqual({ kind: "retry" });
    expect(classifyOutcome(take, { code: "PGRST301", message: "JWT expired", status: 401 })).toEqual({ kind: "retry" });
    expect(classifyOutcome(take, { status: 503 })).toEqual({ kind: "retry" });
  });

  it("refus métier ou de droits : rejeté, visible", () => {
    expect(classifyOutcome(take, { code: "42501" })).toEqual({ kind: "reject", code: "42501" });
    expect(classifyOutcome(take, { code: "BT003" })).toEqual({ kind: "reject", code: "BT003" });
    expect(classifyOutcome(take, { code: "23514" })).toEqual({ kind: "reject", code: "23514" });
  });

  it("annulation hors délai : devient une demande ; déjà annulée : rien à refaire", () => {
    expect(classifyOutcome(cancel, { code: "BT001" })).toEqual({ kind: "convertToRequest" });
    expect(classifyOutcome(cancel, { code: "BT002" })).toEqual({ kind: "done" });
    expect(classifyOutcome({ type: "request", customerId: "awa", shopId: "s1", operationId: "op-1", reason: "x" }, { code: "BT006" })).toEqual({ kind: "done" });
  });
});

describe("retryDelay", () => {
  it("double à chaque essai, plafonné à 60 s", () => {
    expect([1, 2, 3, 4, 10].map(retryDelay)).toEqual([2_000, 4_000, 8_000, 16_000, 60_000]);
  });
});

describe("toCancellationRequest", () => {
  it("garde le motif de l'utilisateur, sinon le motif par défaut ; nouvel identifiant", () => {
    const converted = toCancellationRequest(entry("c-1", cancel, { attempts: 3 }), "r-1");
    expect(converted).toMatchObject({
      id: "r-1",
      attempts: 0,
      command: { type: "request", operationId: "op-1", reason: "Annulation hors ligne arrivée hors délai" },
    });
    expect(toCancellationRequest(entry("c-2", { ...cancel, reason: "Mauvais client" }), "r-2").command).toMatchObject({ reason: "Mauvais client" });
  });
});

describe("curseurs", () => {
  it("la requête repart 5 minutes avant le curseur (lignes validées en retard)", () => {
    expect(pullFrom(null)).toBeNull();
    expect(pullFrom("2026-10-25T10:00:00.000Z")).toBe("2026-10-25T09:55:00.000Z");
  });

  it("le curseur n'avance que vers le plus grand horodatage vu", () => {
    expect(advanceCursor(null, ["2026-10-25T09:00:00Z", "2026-10-25T10:00:00Z", null])).toBe("2026-10-25T10:00:00Z");
    expect(advanceCursor("2026-10-25T11:00:00Z", ["2026-10-25T10:00:00Z"])).toBe("2026-10-25T11:00:00Z");
    expect(advanceCursor("2026-10-25T11:00:00Z", [])).toBe("2026-10-25T11:00:00Z");
  });
});

describe("projection hors ligne", () => {
  it("solde = journal confirmé + saisies en attente", () => {
    const server = [serverOp("op-1", "take", 10000), serverOp("op-2", "payment", 4000)];
    const ops = mergeOperations(server, [entry("op-3", take)]);
    expect(computeBalance(countedOperations(ops)).balance).toBe(-8500);
    expect(ops.find((o) => o.id === "op-3")?.pending).toBe(true);
  });

  it("une annulation en attente exclut déjà l'opération du solde", () => {
    const server = [serverOp("op-1", "take", 10000)];
    expect(computeBalance(countedOperations(mergeOperations(server, [entry("c-1", cancel)]))).balance).toBe(0);
  });

  it("une saisie renvoyée et déjà téléchargée n'est pas comptée deux fois", () => {
    const server = [serverOp("op-3", "take", 2500)];
    expect(computeBalance(countedOperations(mergeOperations(server, [entry("op-3", take)]))).balance).toBe(-2500);
  });

  it("une saisie refusée reste visible mais ne compte pas", () => {
    const ops = mergeOperations([], [entry("op-4", take, { status: "rejected", error: "BT003" })]);
    expect(ops[0]?.rejected).toBe(true);
    expect(computeBalance(countedOperations(ops)).balance).toBe(0);
  });

  it("filtre par client", () => {
    const other = entry("op-5", { ...take, customerId: "ibrahima" });
    expect(mergeOperations([], [entry("op-3", take), other], "awa").map((o) => o.id)).toEqual(["op-3"]);
  });

  it("demandes d'annulation en attente sur l'appareil", () => {
    const request = entry("r-1", { type: "request", customerId: "awa", shopId: "s1", operationId: "op-1", reason: "erreur" });
    expect(pendingRequestTargets([request, entry("op-3", take)])).toEqual(new Set(["op-1"]));
  });
});

describe("syncState", () => {
  it("résume l'état pour l'indicateur", () => {
    expect(syncState({ online: true, pending: 0, rejected: 0 })).toBe("synced");
    expect(syncState({ online: true, pending: 2, rejected: 0 })).toBe("pending");
    expect(syncState({ online: false, pending: 2, rejected: 0 })).toBe("offline");
    expect(syncState({ online: true, pending: 0, rejected: 1 })).toBe("rejected");
  });
});

describe("summarizeByCustomer", () => {
  it("solde et dates par client, saisies en attente comprises", () => {
    const ops = [
      { ...serverOp("op-1", "take", 10000), customerId: "awa" },
      { ...serverOp("op-2", "payment", 4000), customerId: "awa", deviceCreatedAt: "2026-10-24T18:00:00Z" },
      { ...serverOp("op-x", "take", 700), customerId: "ibrahima" },
    ];
    const summaries = summarizeByCustomer(ops, [entry("op-3", take)]);
    expect(summaries.get("awa")).toMatchObject({ balance: -8500, totalTaken: 12500, totalPaid: 4000, lastPaymentAt: "2026-10-24T18:00:00Z", pending: 1 });
    expect(summaries.get("ibrahima")).toMatchObject({ balance: -700, pending: 0 });
  });

  it("un client sans opération confirmée mais avec une saisie en attente apparaît", () => {
    expect(summarizeByCustomer([], [entry("op-3", take)]).get("awa")?.balance).toBe(-2500);
  });
});

describe("rejectionMessage", () => {
  it("traduit les codes de refus", () => {
    expect(rejectionMessage("42501")).toBe("forbidden");
    expect(rejectionMessage("BT003")).toBe("customerArchived");
    expect(rejectionMessage("XX")).toBe("unexpected");
  });
});

describe("stock hors ligne", () => {
  const stockCancel: OutboxCommand = { type: "stock.cancel", shopId: "s1", productId: "riz", movementId: "m-1", reason: null, fallbackReason: "Arrivée hors délai" };
  it("annulation de mouvement hors délai : devient une demande ; sac déjà entamé : refus visible", () => {
    expect(classifyOutcome(stockCancel, { code: "BT001" })).toEqual({ kind: "convertToRequest" });
    expect(toCancellationRequest(entry("c-1", stockCancel), "r-1").command).toEqual({ type: "stock.request", shopId: "s1", productId: "riz", movementId: "m-1", reason: "Arrivée hors délai" });
    expect(classifyOutcome({ type: "stock.open", shopId: "s1", productId: "riz" }, { code: "BT010" })).toEqual({ kind: "reject", code: "BT010" });
    expect(rejectionMessage("BT011")).toBe("noClosedPackage");
  });

  it("vente entière sur compte : la prise compte déjà dans le solde du client", () => {
    const sell = entry("m-2", { type: "stock.sell", shopId: "s1", productId: "riz", price: 15000, customerId: "awa", takeId: "t-1" });
    expect(computeBalance(countedOperations(mergeOperations([], [sell], "awa"))).balance).toBe(-15000);
    expect(summarizeByCustomer([], [sell]).get("awa")?.balance).toBe(-15000);
  });
});
