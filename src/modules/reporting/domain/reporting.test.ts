import { describe, expect, it } from "vitest";
import type { ClosingRecord, FlowOperation } from "@/modules/cash";
import { grossProfit, periodCash, periodDays, resolvePeriod, type ReviewForProfit, type WholeSaleForProfit } from "./reporting";

const TZ = "Africa/Dakar";
const october = { from: "2026-10-01", to: "2026-10-31" };

// Exemple du cahier : sac de riz 50 kg acheté 14 400 F, 315 F/kg → marge 1 350 F, comptant estimé 13 545 F.
const reviews: ReviewForProfit[] = [
  { productId: "riz", finishedAt: "2026-10-04T18:00:00Z", expectedRevenue: 15_750, estimatedCashSales: 13_545, grossMargin: 1_350 },
  { productId: "riz", finishedAt: "2026-10-09T18:00:00Z", expectedRevenue: 15_750, estimatedCashSales: 15_750, grossMargin: 1_350 },
  { productId: "sucre", finishedAt: "2026-10-12T10:00:00Z", expectedRevenue: 30_000, estimatedCashSales: 28_000, grossMargin: 2_000 },
  // Terminé en septembre : hors période.
  { productId: "riz", finishedAt: "2026-09-30T18:00:00Z", expectedRevenue: 15_750, estimatedCashSales: 15_750, grossMargin: 1_350 },
];
const wholeSales: WholeSaleForProfit[] = [
  { id: "w1", productId: "riz", amount: 15_000, cost: 14_400, customerOperationId: null, deviceCreatedAt: "2026-10-05T09:00:00Z", cancelled: false },
  { id: "w2", productId: "riz", amount: 14_800, cost: 14_400, customerOperationId: "t9", deviceCreatedAt: "2026-10-06T09:00:00Z", cancelled: false },
  { id: "w3", productId: "huile", amount: 22_000, cost: 20_000, customerOperationId: null, deviceCreatedAt: "2026-10-07T09:00:00Z", cancelled: true },
];

describe("bénéfice brut (RG8)", () => {
  it("Σ marges des bilans terminés + Σ marges des sacs vendus entiers, par produit", () => {
    const profit = grossProfit({ reviews, wholeSales, period: october, timeZone: TZ });
    expect(profit.reviewsMargin).toBe(4_700);
    expect(profit.wholeSalesMargin).toBe(1_000);
    expect(profit.total).toBe(5_700);
    expect(profit.byProduct).toEqual([
      { productId: "riz", reviewsMargin: 2_700, packagesFinished: 2, wholeSalesMargin: 1_000, wholeSold: 2, margin: 3_700 },
      { productId: "sucre", reviewsMargin: 2_000, packagesFinished: 1, wholeSalesMargin: 0, wholeSold: 0, margin: 2_000 },
    ]);
  });

  it("une vente entière à perte réduit le bénéfice ; une vente annulée n'y est pas", () => {
    const loss = [{ ...wholeSales[0]!, amount: 14_000 }];
    expect(grossProfit({ reviews: [], wholeSales: loss, period: october, timeZone: TZ }).total).toBe(-400);
  });
});

describe("argent encaissé sur une période (RG8)", () => {
  const ops: FlowOperation[] = [
    { id: "t1", kind: "take", amount: 13_680, cancelsOperationId: null, deviceCreatedAt: "2026-10-05T10:00:00Z" },
    { id: "p1", kind: "payment", amount: 5_000, cancelsOperationId: null, deviceCreatedAt: "2026-10-05T12:00:00Z", paymentMethodId: "cash" },
    { id: "p2", kind: "payment", amount: 3_000, cancelsOperationId: null, deviceCreatedAt: "2026-10-06T12:00:00Z", paymentMethodId: "wave" },
    // Prise créée par la vente du sac entier w2 sur le compte d'un client.
    { id: "t9", kind: "take", amount: 14_800, cancelsOperationId: null, deviceCreatedAt: "2026-10-06T09:00:00Z" },
  ];
  const closing = (date: string, total: number): ClosingRecord => ({
    id: date,
    businessDate: date,
    totalReceived: total,
    amounts: [],
    note: null,
    authorId: "u",
    deviceCreatedAt: `${date}T20:00:00Z`,
    serverCreatedAt: `${date}T20:00:01Z`,
  });

  it("jour clôturé : tout l'argent reçu ; jour sans clôture : versements et sacs entiers au comptant", () => {
    const cash = periodCash({
      operations: ops,
      wholeSales,
      closings: [closing("2026-10-05", 60_000)],
      reviews,
      period: { from: "2026-10-05", to: "2026-10-06" },
      timeZone: TZ,
    });
    // 5 oct. clôturé : 60 000 F reçus, dont 5 000 F de versement et 15 000 F de sac entier → 40 000 F au détail.
    // 6 oct. sans clôture : 3 000 F de versement (le sac vendu sur un compte n'encaisse rien).
    expect(cash).toEqual({ collected: 63_000, counterCashDeclared: 40_000, counterCashExpected: 0, accountTakes: 28_480, closedDays: 1, days: 2 });
  });

  it("comptant attendu des bilans affiché à côté du comptant déclaré (sans contrôle automatique)", () => {
    const cash = periodCash({ operations: [], wholeSales: [], closings: [], reviews, period: october, timeZone: TZ });
    expect(cash.counterCashExpected).toBe(57_295);
    expect(cash.days).toBe(31);
  });

  it("jours d'une période, bornes comprises, changement de mois", () => {
    expect(periodDays({ from: "2026-02-27", to: "2026-03-02" })).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  });
});

describe("choix de la période", () => {
  const today = "2026-10-23";
  it("mois en cours par défaut, mois précédent complet (y compris en janvier)", () => {
    expect(resolvePeriod({}, today)).toEqual({ choice: "current", period: { from: "2026-10-01", to: "2026-10-23" } });
    expect(resolvePeriod({ period: "previous" }, today).period).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(resolvePeriod({ period: "previous" }, "2027-01-05").period).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("dates choisies : acceptées si valides, dans l'ordre, passées et sur moins d'un an", () => {
    expect(resolvePeriod({ period: "custom", from: "2026-10-05", to: "2026-10-12" }, today)).toEqual({ choice: "custom", period: { from: "2026-10-05", to: "2026-10-12" } });
    for (const [from, to] of [
      ["2026-10-12", "2026-10-05"],
      ["2026-10-05", "2026-10-30"],
      ["2025-01-01", "2026-10-01"],
      ["2026-13-01", "2026-10-01"],
      ["hier", "2026-10-01"],
    ]) {
      expect(resolvePeriod({ period: "custom", from, to }, today).choice).toBe("current");
    }
  });
});
