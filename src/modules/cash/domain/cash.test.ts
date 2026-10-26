import { describe, expect, it } from "vitest";
import {
  counterCashSales,
  dayFlows,
  daySales,
  estimatedDailyCounterCash,
  latestClosings,
  type ClosingRecord,
  type FlowOperation,
  type WholeSale,
} from "./cash";

const TZ = "Africa/Dakar";
const DAY = "2026-10-23";
const at = (time: string, day = DAY) => `${day}T${time}:00Z`;

const operations: FlowOperation[] = [
  { id: "t1", kind: "take", amount: 13_680, cancelsOperationId: null, deviceCreatedAt: at("09:10") },
  // Sac entier vendu sur le compte d'un client : c'est une prise.
  { id: "t2", kind: "take", amount: 14_400, cancelsOperationId: null, deviceCreatedAt: at("10:00") },
  { id: "t3", kind: "take", amount: 1_000, cancelsOperationId: null, deviceCreatedAt: at("11:00") },
  { id: "c3", kind: "cancellation", amount: null, cancelsOperationId: "t3", deviceCreatedAt: at("11:05") },
  { id: "p1", kind: "payment", amount: 5_000, cancelsOperationId: null, deviceCreatedAt: at("12:00"), paymentMethodId: "cash" },
  { id: "p2", kind: "payment", amount: 2_000, cancelsOperationId: null, deviceCreatedAt: at("18:00"), paymentMethodId: "wave" },
  // La veille : ne compte pas.
  { id: "t0", kind: "take", amount: 9_999, cancelsOperationId: null, deviceCreatedAt: at("20:00", "2026-10-22") },
];
const wholeSales: WholeSale[] = [
  { id: "w1", productId: "riz", amount: 15_000, customerOperationId: null, deviceCreatedAt: at("08:30"), cancelled: false },
  { id: "w2", productId: "riz", amount: 14_400, customerOperationId: "t2", deviceCreatedAt: at("10:00"), cancelled: false },
  { id: "w3", productId: "sucre", amount: 28_000, customerOperationId: null, deviceCreatedAt: at("15:00"), cancelled: true },
];

describe("flux d'une journée (RG7)", () => {
  it("prises à compte, versements par moyen, sacs entiers au comptant ; annulations et autres jours exclus", () => {
    const flows = dayFlows({ operations, wholeSales, date: DAY, timeZone: TZ });
    expect(flows.accountTakes).toBe(28_080);
    expect(flows.payments).toBe(7_000);
    expect(Object.fromEntries(flows.paymentsByMethod)).toEqual({ cash: 5_000, wave: 2_000 });
    // Le sac vendu sur un compte est déjà une prise : il n'est compté qu'une fois.
    expect(flows.wholeSalesCash).toBe(15_000);
  });

  it("le jour est celui de la boutique (fuseau), pas celui de l'UTC", () => {
    const late = [{ id: "x", kind: "take", amount: 500, cancelsOperationId: null, deviceCreatedAt: "2026-10-23T23:30:00Z" }] as FlowOperation[];
    expect(dayFlows({ operations: late, wholeSales: [], date: "2026-10-23", timeZone: TZ }).accountTakes).toBe(500);
    expect(dayFlows({ operations: late, wholeSales: [], date: "2026-10-24", timeZone: "Europe/Paris" }).accountTakes).toBe(500);
  });
});

describe("clôture et ventes au comptant déduites (RG7)", () => {
  const flows = dayFlows({ operations, wholeSales, date: DAY, timeZone: TZ });

  it("argent reçu 55 000 F − versements 7 000 F − sacs entiers 15 000 F = 33 000 F au détail", () => {
    expect(counterCashSales(55_000, flows)).toBe(33_000);
  });

  it("ventes du jour = prises 28 080 + sacs entiers 15 000 + comptant 33 000 = 76 080 F", () => {
    expect(daySales(flows, { totalReceived: 55_000 }, null)).toEqual({
      accountTakes: 28_080,
      wholeSalesCash: 15_000,
      counterCash: 33_000,
      basis: "closed",
      total: 76_080,
      negativeCounterCash: false,
    });
  });

  it("une clôture inférieure aux versements et sacs entiers est signalée, pas corrigée", () => {
    const sales = daySales(flows, { totalReceived: 20_000 }, null);
    expect(sales.counterCash).toBe(-2_000);
    expect(sales.negativeCounterCash).toBe(true);
  });

  it("sans clôture : estimation d'après les bilans, marquée comme telle", () => {
    expect(daySales(flows, null, 12_000)).toMatchObject({ basis: "estimated", counterCash: 12_000, total: 55_080 });
    expect(daySales(flows, null, null)).toMatchObject({ basis: "unknown", counterCash: null, total: 43_080 });
  });

  it("la dernière clôture du jour fait foi ; une saisie en attente sur l'appareil passe devant", () => {
    const base = { amounts: [], note: null, authorId: "u", deviceCreatedAt: at("20:00") };
    const closings: ClosingRecord[] = [
      { ...base, id: "a", businessDate: DAY, totalReceived: 50_000, serverCreatedAt: at("20:01") },
      { ...base, id: "b", businessDate: DAY, totalReceived: 55_000, serverCreatedAt: at("21:00") },
      { ...base, id: "c", businessDate: "2026-10-22", totalReceived: 40_000, serverCreatedAt: at("20:00", "2026-10-22") },
    ];
    expect(latestClosings(closings).get(DAY)?.id).toBe("b");
    const pending = { ...base, id: "d", businessDate: DAY, totalReceived: 56_000, deviceCreatedAt: at("19:00"), serverCreatedAt: null };
    expect(latestClosings([...closings, pending]).get(DAY)?.id).toBe("d");
    expect(latestClosings(closings).get("2026-10-22")?.totalReceived).toBe(40_000);
  });
});

describe("estimation du comptant sans clôture", () => {
  it("rythme des derniers sacs : riz 13 545 F en 3 jours, sucre 9 000 F en 6 jours → 4 515 + 1 500 = 6 015 F/jour", () => {
    expect(
      estimatedDailyCounterCash([
        { productId: "riz", openedAt: "2026-10-01T08:00:00Z", finishedAt: "2026-10-04T08:00:00Z", estimatedCashSales: 13_545 },
        { productId: "sucre", openedAt: "2026-10-01T08:00:00Z", finishedAt: "2026-10-07T08:00:00Z", estimatedCashSales: 9_000 },
      ]),
    ).toBe(6_015);
  });

  it("seuls les 3 derniers sacs d'un produit comptent ; sans bilan, pas d'estimation", () => {
    const riz = (day: number, cash: number) => ({
      productId: "riz",
      openedAt: `2026-10-${String(day).padStart(2, "0")}T08:00:00Z`,
      finishedAt: `2026-10-${String(day + 1).padStart(2, "0")}T08:00:00Z`,
      estimatedCashSales: cash,
    });
    expect(estimatedDailyCounterCash([riz(1, 100_000), riz(3, 6_000), riz(5, 6_000), riz(7, 6_000)])).toBe(6_000);
    expect(estimatedDailyCounterCash([])).toBeNull();
    expect(estimatedDailyCounterCash([{ productId: "riz", openedAt: null, finishedAt: null, estimatedCashSales: 1 }])).toBeNull();
  });
});
