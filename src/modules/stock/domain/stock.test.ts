import { describe, expect, it } from "vitest";
import { estimateKey, expectedRevenue, inventoryDelta, needsReorder, packageReview, projectStock, ruptureEstimate } from "./stock";

const seg = (startRemaining: number, retailPrice: number, createdAt = "2026-10-25T08:00:00Z") => ({ startRemaining, retailPrice, createdAt });

describe("bilan de sac (RG2) — exemples du cahier", () => {
  it("sac de riz 50 kg acheté 14 400 F, 315 F/kg : attendu 15 750 F, marge 1 350 F, comptant estimé 13 545 F", () => {
    expect(
      packageReview({
        segments: [seg(1000, 315)],
        capacityMilli: 50_000,
        accountTakes: 2205,
        cost: 14400,
        openedAt: "2026-10-20T08:00:00Z",
        finishedAt: "2026-10-25T08:00:00Z",
      }),
    ).toEqual({ expectedRevenue: 15750, accountTakes: 2205, estimatedCashSales: 13545, cost: 14400, grossMargin: 1350, durationMs: 5 * 86_400_000 });
  });

  it("baisse immédiate de 330 à 315 F/kg à mi-sac : 8 250 + 7 875 = 16 125 F", () => {
    expect(expectedRevenue([seg(1000, 330), seg(500, 315, "2026-10-25T09:00:00Z")], 50_000)).toBe(16125);
  });

  it("presque vide = 10 % ; plusieurs changements", () => {
    expect(expectedRevenue([seg(1000, 300), seg(500, 320, "2026-10-25T09:00:00Z"), seg(100, 340, "2026-10-25T10:00:00Z")], 50_000)).toBe(15600);
  });

  it("changement juste après l'ouverture (même reste) : la première tranche ne compte pas", () => {
    expect(expectedRevenue([seg(1000, 330), seg(1000, 315, "2026-10-25T08:01:00Z")], 50_000)).toBe(15750);
  });

  it("sans arrondi intermédiaire, arrondi à l'entier à la fin", () => {
    // 20 L à 1 105 F/L, baisse à 1 097 F/L aux ¾ : 5 × 1 105 + 15 × 1 097 = 5 525 + 16 455
    expect(expectedRevenue([seg(1000, 1105), seg(750, 1097, "2026-10-25T09:00:00Z")], 20_000)).toBe(21980);
    // 48 sachets à 255 F, reste ¼ à 249 F : 36 × 255 + 12 × 249 = 9 180 + 2 988
    expect(expectedRevenue([seg(1000, 255), seg(250, 249, "2026-10-25T09:00:00Z")], 48_000)).toBe(12168);
    // 25 kg × 333 F, reste presque vide (10 %) à 327 F : 22,5 × 333 + 2,5 × 327 = 7 492,5 + 817,5 = 8 310
    expect(expectedRevenue([seg(1000, 333), seg(100, 327, "2026-10-25T09:00:00Z")], 25_000)).toBe(8310);
  });
});

describe("projectStock", () => {
  it("applique les saisies en attente sur l'appareil", () => {
    const server = { closed: 2, opened: null };
    expect(projectStock(server, [{ type: "stock.open" }])).toEqual({ closed: 1, opened: { remaining: 1000, openedAt: null, pending: true } });
    expect(projectStock(server, [{ type: "stock.receive", count: 3 }, { type: "stock.sell" }])).toEqual({ closed: 4, opened: null });
    const opened = { closed: 1, opened: { remaining: 500, openedAt: "2026-10-24T08:00:00Z", pending: false } };
    expect(projectStock(opened, [{ type: "stock.finish" }]).opened).toBeNull();
    expect(projectStock(opened, [{ type: "stock.estimate", estimate: 250 }]).opened?.remaining).toBe(250);
    expect(projectStock(server, [{ type: "stock.adjust", delta: -1 }])).toEqual({ closed: 1, opened: null });
  });

  it("une ouverture sans sac fermé ou avec un sac déjà entamé ne change rien (le serveur refusera)", () => {
    expect(projectStock({ closed: 0, opened: null }, [{ type: "stock.open" }])).toEqual({ closed: 0, opened: null });
  });
});

describe("rupture et rachat", () => {
  const now = new Date("2026-10-25T08:00:00Z");
  it("stock restant × durée moyenne des derniers sacs", () => {
    const day = 86_400_000;
    const view = { closed: 2, opened: { remaining: 500, openedAt: null, pending: false } };
    expect(ruptureEstimate(view, [4 * day, 6 * day], now)).toEqual({ days: 13, date: new Date(now.getTime() + 2.5 * 5 * day) });
    expect(ruptureEstimate(view, [], now)).toBeNull();
  });

  it("à racheter au seuil ou en dessous", () => {
    expect(needsReorder(1, 1)).toBe(true);
    expect(needsReorder(2, 1)).toBe(false);
  });
});

describe("estimations et inventaire", () => {
  it("libellé du reste estimé", () => {
    expect([1000, 750, 500, 250, 100, null].map(estimateKey)).toEqual(["full", "threeQuarters", "half", "quarter", "almostEmpty", "unknown"]);
  });
  it("écart d'inventaire", () => {
    expect(inventoryDelta(3, 5)).toBe(-2);
    expect(inventoryDelta(6, 5)).toBe(1);
  });
});
