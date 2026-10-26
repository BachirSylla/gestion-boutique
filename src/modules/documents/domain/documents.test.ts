import { describe, expect, it } from "vitest";
import {
  currentMonthPeriod,
  fileSlug,
  firstName,
  nextDueDate,
  operationNumber,
  pdfText,
  previousMonthPeriod,
  receiptData,
  receiptFileName,
  statementData,
  statementFileName,
  type DocOperation,
} from "./documents";

let n = 0;
function op(kind: DocOperation["kind"], amount: number | null, at: string, extra: Partial<DocOperation> = {}): DocOperation {
  n += 1;
  return {
    id: `0000000${n}-aaaa-bbbb-cccc-000000000000`,
    kind,
    amount,
    deviceCreatedAt: at,
    cancelsOperationId: null,
    note: null,
    lines: [],
    authorName: "Moussa Sarr",
    paymentMethodLabel: null,
    ...extra,
  };
}

describe("reçu (RG9)", () => {
  it("ancien et nouveau solde au moment de l'opération, prénom de l'auteur, numéro", () => {
    const first = op("take", 5000, "2026-10-20T10:00:00Z");
    const payment = op("payment", 2000, "2026-10-21T10:00:00Z", { paymentMethodLabel: "Wave" });
    const take = op("take", 13680, "2026-10-23T14:32:00Z", { note: "riz + huile" });
    const later = op("take", 999, "2026-10-24T09:00:00Z");
    const receipt = receiptData(take, [first, payment, take, later]);
    expect(receipt).toMatchObject({ kind: "take", total: 13680, balanceBefore: -3000, balanceAfter: -16680, authorFirstName: "Moussa", note: "riz + huile" });
    expect(receipt.operationNumber).toBe(operationNumber(take.id));
    expect(receiptData(payment, [first, payment, take])).toMatchObject({ balanceBefore: -5000, balanceAfter: -3000, paymentMethodLabel: "Wave" });
  });

  it("une opération annulée avant ne compte pas dans l'ancien solde ; annulée après, si", () => {
    const wrong = op("take", 4000, "2026-10-20T10:00:00Z");
    const cancelBefore = op("cancellation", null, "2026-10-20T10:05:00Z", { cancelsOperationId: wrong.id });
    const take = op("take", 1000, "2026-10-21T10:00:00Z");
    expect(receiptData(take, [wrong, cancelBefore, take]).balanceBefore).toBe(0);
    const cancelAfter = op("cancellation", null, "2026-10-22T10:00:00Z", { cancelsOperationId: wrong.id });
    expect(receiptData(take, [wrong, take, cancelAfter]).balanceBefore).toBe(-4000);
  });

  it("pas de reçu pour une annulation", () => {
    expect(() => receiptData(op("cancellation", null, "2026-10-20T10:00:00Z"), [])).toThrow();
  });

  it("numéro d'opération et prénom", () => {
    expect(operationNumber("1ddf49fe-65a6-48bb-95b9-02d20ef81327")).toBe("1DDF49FE");
    expect(firstName("  Moussa Sarr ")).toBe("Moussa");
  });
});

describe("échéance d'un client mensuel", () => {
  it("fin de mois ou jour réglé, toujours à venir", () => {
    expect(nextDueDate("2026-10-23", null)).toBe("2026-10-31");
    expect(nextDueDate("2026-10-31", null)).toBe("2026-10-31");
    expect(nextDueDate("2026-10-23", 5)).toBe("2026-11-05");
    expect(nextDueDate("2026-10-05", 5)).toBe("2026-10-05");
    expect(nextDueDate("2026-12-23", 5)).toBe("2027-01-05");
    expect(nextDueDate("2027-02-10", null)).toBe("2027-02-28");
  });
});

describe("relevé de compte (RG9)", () => {
  const tz = "Africa/Dakar";
  it("solde reporté, solde après chaque ligne, totaux et reste à payer", () => {
    const ops = [
      op("take", 10000, "2026-09-25T10:00:00Z"), // avant la période
      op("payment", 3000, "2026-09-28T10:00:00Z"),
      op("take", 2500, "2026-10-02T10:00:00Z"),
      op("payment", 5000, "2026-10-10T10:00:00Z"),
      op("take", 1500, "2026-10-20T10:00:00Z"),
      op("take", 700, "2026-10-24T10:00:00Z"), // après la période
    ];
    const s = statementData(ops, "2026-10-01", "2026-10-23", tz);
    expect(s.carriedBalance).toBe(-7000);
    expect(s.rows.map((r) => r.balanceAfter)).toEqual([-9500, -4500, -6000]);
    expect(s).toMatchObject({ totalTaken: 4000, totalPaid: 5000, closingBalance: -6000, amountDue: 6000 });
  });

  it("les annulations restent visibles, barrées, sans effet sur les soldes", () => {
    const wrong = op("take", 9999, "2026-10-05T10:00:00Z");
    const ops = [op("payment", 20000, "2026-10-01T10:00:00Z"), wrong, op("cancellation", null, "2026-10-05T10:10:00Z", { cancelsOperationId: wrong.id }), op("take", 1000, "2026-10-06T10:00:00Z")];
    const s = statementData(ops, "2026-10-01", "2026-10-31", tz);
    expect(s.rows.map((r) => [r.kind, r.cancelled, r.balanceAfter])).toEqual([
      ["payment", false, 20000],
      ["take", true, 20000],
      ["take", false, 19000],
    ]);
    expect(s).toMatchObject({ totalTaken: 1000, totalPaid: 20000, closingBalance: 19000, amountDue: 0 });
  });

  it("le solde de fin de période est le solde du client à cette date", () => {
    const ops = [op("take", 1000, "2026-10-01T23:30:00Z"), op("payment", 400, "2026-10-02T00:30:00Z")];
    expect(statementData(ops, "2026-10-01", "2026-10-01", tz).closingBalance).toBe(-1000);
    expect(statementData(ops, "2026-10-02", "2026-10-02", tz).carriedBalance).toBe(-1000);
  });

  it("périodes proposées", () => {
    expect(currentMonthPeriod("2026-10-23")).toEqual({ from: "2026-10-01", to: "2026-10-23" });
    expect(previousMonthPeriod("2026-10-23")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(previousMonthPeriod("2026-01-10")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
});

describe("noms de fichiers (RG9)", () => {
  it("explicites, sans espace ni accent", () => {
    expect(fileSlug("Awa Ndiaye")).toBe("Awa-Ndiaye");
    expect(fileSlug("Aïssatou  Bâ (Médina)")).toBe("Aissatou-Ba-Medina");
    expect(receiptFileName("Awa Ndiaye", "2026-10-23T14:32:00Z", "Africa/Dakar", "png")).toBe("Recu_Awa-Ndiaye_2026-10-23_14h32.png");
    expect(statementFileName("Awa Ndiaye", "2026-10-01", "2026-10-23")).toBe("Releve_Awa-Ndiaye_2026-10-01_au_2026-10-23.pdf");
  });
});

describe("pdfText", () => {
  it("remplace ce que les polices PDF standard n'ont pas, garde le reste", () => {
    expect(pdfText("−13 680 F")).toBe("-13 680 F");
    expect(pdfText("Riz ½ kg · 2 × 160 F — été")).toBe("Riz ½ kg · 2 × 160 F - été");
    expect(pdfText("Wolof : ŋ")).toBe("Wolof : ?");
    expect(pdfText("l’avance…")).toBe("l'avance...");
  });
});
