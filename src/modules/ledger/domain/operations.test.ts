import { describe, expect, it } from "vitest";
import { balanceAfter, buildDetailedTake, cancellationPath, computeBalance, type LedgerOperation } from "./operations";

let seq = 0;
function op(kind: LedgerOperation["kind"], amount: number | null, extra: Partial<LedgerOperation> = {}): LedgerOperation {
  seq += 1;
  return {
    id: `op-${seq}`,
    kind,
    amount,
    cancelsOperationId: null,
    authorId: "moussa",
    deviceCreatedAt: "2026-10-23T10:00:00Z",
    serverCreatedAt: "2026-10-23T10:00:00Z",
    ...extra,
  };
}

describe("computeBalance (RG1)", () => {
  it("solde = versements − prises", () => {
    const ops = [op("take", 2500), op("take", 1500), op("payment", 3000)];
    expect(computeBalance(ops)).toEqual({ balance: -1000, totalTaken: 4000, totalPaid: 3000 });
  });

  it("un client à l'avance a un solde positif", () => {
    expect(computeBalance([op("payment", 10000), op("take", 2205)]).balance).toBe(7795);
  });

  it("les opérations annulées sont exclues", () => {
    const wrong = op("take", 5000);
    const ops = [op("take", 2000), wrong, op("cancellation", null, { cancelsOperationId: wrong.id })];
    expect(computeBalance(ops)).toEqual({ balance: -2000, totalTaken: 2000, totalPaid: 0 });
  });

  it("un versement annulé ne compte plus", () => {
    const payment = op("payment", 3000);
    expect(computeBalance([op("take", 3000), payment, op("cancellation", null, { cancelsOperationId: payment.id })]).balance).toBe(-3000);
  });

  it("sans opération, le solde est nul", () => {
    expect(computeBalance([]).balance).toBe(0);
  });
});

describe("balanceAfter", () => {
  it("affiche le nouveau solde en direct", () => {
    expect(balanceAfter(-1000, "take", 2500)).toBe(-3500);
    expect(balanceAfter(-1000, "payment", 2500)).toBe(1500);
  });
});

describe("buildDetailedTake (RG3)", () => {
  it("arrondit chaque ligne puis additionne les lignes arrondies", () => {
    const result = buildDetailedTake(
      [
        { label: "Riz brisé", quantity: 250, unit: "kg", unitPrice: 315 }, // 78,75 → 80
        { label: "Riz brisé", quantity: 250, unit: "kg", unitPrice: 315 }, // 80
        { label: "Huile", quantity: 500, unit: "l", unitPrice: 1100 }, // 550
      ],
      5,
    );
    expect(result).toMatchObject({ ok: true, total: 710 });
    if (result.ok) expect(result.lines.map((l) => l.lineAmount)).toEqual([80, 80, 550]);
  });

  it("exemple du bilan de sac : 2 × 1 kg + 5 kg de riz à 315 F = 2 205 F", () => {
    const result = buildDetailedTake(
      [
        { label: "Riz", quantity: 1000, unit: "kg", unitPrice: 315 },
        { label: "Riz", quantity: 1000, unit: "kg", unitPrice: 315 },
        { label: "Riz", quantity: 5000, unit: "kg", unitPrice: 315 },
      ],
      5,
    );
    expect(result).toMatchObject({ ok: true, total: 2205 });
  });

  it("ligne format : nombre × prix du format, sans arrondi (riz ½ kg = 160 F)", () => {
    const result = buildDetailedTake(
      [
        { label: "Riz ½ kg", quantity: 1000, unit: "kg", unitPrice: 160, productId: "riz", format: { label: "½ kg", count: 2 } },
        { label: "Riz", quantity: 250, unit: "kg", unitPrice: 315, productId: "riz" },
      ],
      5,
    );
    expect(result).toMatchObject({ ok: true, total: 400 });
    if (result.ok) expect(result.lines.map((l) => l.lineAmount)).toEqual([320, 80]);
  });

  it("signale la ligne fautive", () => {
    expect(buildDetailedTake([{ label: " ", quantity: 1000, unit: "kg", unitPrice: 315 }], 5)).toEqual({ ok: false, index: 0, error: "labelRequired" });
    expect(buildDetailedTake([{ label: "Riz", quantity: 1000, unit: "kg", unitPrice: 315 }, { label: "Sucre", quantity: 0, unit: "kg", unitPrice: 600 }], 5)).toEqual({
      ok: false,
      index: 1,
      error: "quantityInvalid",
    });
    expect(buildDetailedTake([{ label: "Riz", quantity: 1000, unit: "kg", unitPrice: 0 }], 5)).toMatchObject({ error: "priceInvalid" });
    expect(buildDetailedTake([{ label: "Sel", quantity: 1, unit: "kg", unitPrice: 100 }], 5)).toMatchObject({ error: "amountZero" }); // 0,1 F → 0
  });
});

describe("cancellationPath (RG1)", () => {
  const now = new Date("2026-10-23T10:20:00Z");
  const base = { userId: "moussa", now, windowMinutes: 15, alreadyCancelled: false };

  it("le gérant annule librement sa propre opération dans le délai", () => {
    const operation = { kind: "take" as const, authorId: "moussa", serverCreatedAt: "2026-10-23T10:06:00Z" };
    expect(cancellationPath({ ...base, role: "manager", operation })).toBe("direct");
  });

  it("au-delà du délai, il doit demander", () => {
    const operation = { kind: "take" as const, authorId: "moussa", serverCreatedAt: "2026-10-23T10:04:59Z" };
    expect(cancellationPath({ ...base, role: "manager", operation })).toBe("request");
  });

  it("le délai réglé par le propriétaire s'applique (jusqu'à 60 min)", () => {
    const operation = { kind: "take" as const, authorId: "moussa", serverCreatedAt: "2026-10-23T09:30:00Z" };
    expect(cancellationPath({ ...base, role: "manager", operation, windowMinutes: 60 })).toBe("direct");
    expect(cancellationPath({ ...base, role: "manager", operation, windowMinutes: 0 })).toBe("request");
  });

  it("l'opération d'un autre : demande, même dans le délai", () => {
    const operation = { kind: "payment" as const, authorId: "awa", serverCreatedAt: "2026-10-23T10:19:00Z" };
    expect(cancellationPath({ ...base, role: "manager", operation })).toBe("request");
  });

  it("le propriétaire annule directement ; le comptable jamais", () => {
    const operation = { kind: "take" as const, authorId: "moussa", serverCreatedAt: "2026-01-01T00:00:00Z" };
    expect(cancellationPath({ ...base, role: "owner", operation })).toBe("direct");
    expect(cancellationPath({ ...base, role: "accountant", operation })).toBe("none");
  });

  it("une annulation ne s'annule pas ; une opération annulée non plus", () => {
    expect(cancellationPath({ ...base, role: "owner", operation: { kind: "cancellation", authorId: "moussa", serverCreatedAt: now.toISOString() } })).toBe("none");
    expect(cancellationPath({ ...base, role: "owner", alreadyCancelled: true, operation: { kind: "take", authorId: "moussa", serverCreatedAt: now.toISOString() } })).toBe("none");
  });
});
