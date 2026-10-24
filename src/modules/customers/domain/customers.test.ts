import { describe, expect, it } from "vitest";
import {
  amountOwed,
  groupByDay,
  isOverLimit,
  limitUsage,
  matchesCustomer,
  parseAmountInput,
  parseCustomerInput,
  reminderReasons,
  shopTotals,
  type CustomerFacts,
  type CustomerStats,
  type ReminderSettings,
} from "./customers";

const settings: ReminderSettings = { advanceAlertThreshold: 1000, freeCreditReminderDays: 30, monthlyDueDay: null, timeZone: "Africa/Dakar" };
const stats = (s: Partial<CustomerStats>): CustomerStats => ({ balance: 0, totalPaid: 0, lastPaymentAt: null, firstTakeAt: null, ...s });
const facts = (f: Partial<CustomerFacts>): CustomerFacts => ({ type: "free", creditLimit: null, alertThreshold: null, monthlyDueDay: null, ...f });

describe("plafond (simple alerte)", () => {
  it("mesure la dette par rapport au plafond", () => {
    expect(amountOwed(-13680)).toBe(13680);
    expect(amountOwed(500)).toBe(0);
    expect(limitUsage(-12500, 25000)).toBe(0.5);
    expect(limitUsage(-12500, null)).toBeNull();
    expect(isOverLimit(-25001, 25000)).toBe(true);
    expect(isOverLimit(-25000, 25000)).toBe(false);
  });
});

describe("reminderReasons (liste « À relancer »)", () => {
  const today = "2026-10-23";

  it("mensuel : relancé si une prise d'avant la dernière échéance reste impayée", () => {
    const monthly = facts({ type: "monthly" });
    // 18 000 F pris jusqu'au 30 sept., 10 000 F versés : 8 000 F échus.
    expect(reminderReasons(monthly, stats({ balance: -12000, takenUntilLastDue: 18000, totalPaid: 10000 }), settings, today)).toEqual([
      { kind: "overdue", dueDate: "2026-09-30", overdue: 8000 },
    ]);
  });

  it("mensuel : pas de relance pour des prises faites depuis l'échéance", () => {
    expect(reminderReasons(facts({ type: "monthly" }), stats({ balance: -4000, takenUntilLastDue: 0, totalPaid: 0 }), settings, today)).toEqual([]);
    expect(reminderReasons(facts({ type: "monthly" }), stats({ balance: -4000, takenUntilLastDue: 6000, totalPaid: 6000 }), settings, today)).toEqual([]);
  });

  it("mensuel : le jour d'échéance du client prime sur celui de la boutique", () => {
    const reasons = reminderReasons(facts({ type: "monthly", monthlyDueDay: 5 }), stats({ balance: -100, takenUntilLastDue: 100 }), settings, today);
    expect(reasons).toEqual([{ kind: "overdue", dueDate: "2026-10-05", overdue: 100 }]);
  });

  it("plafond dépassé, quel que soit le type", () => {
    expect(reminderReasons(facts({ creditLimit: 25000 }), stats({ balance: -27500, lastPaymentAt: "2026-10-20T10:00:00Z" }), settings, today)).toEqual([
      { kind: "overLimit", limit: 25000, excess: 2500 },
    ]);
  });

  it("avance sous le seuil (client, sinon boutique)", () => {
    expect(reminderReasons(facts({ type: "advance" }), stats({ balance: 800 }), settings, today)).toEqual([{ kind: "lowAdvance", threshold: 1000 }]);
    expect(reminderReasons(facts({ type: "advance" }), stats({ balance: 1000 }), settings, today)).toEqual([]);
    expect(reminderReasons(facts({ type: "advance", alertThreshold: 5000 }), stats({ balance: 3000 }), settings, today)).toEqual([{ kind: "lowAdvance", threshold: 5000 }]);
    expect(reminderReasons(facts({ type: "advance" }), stats({ balance: -200 }), settings, today)).toEqual([{ kind: "lowAdvance", threshold: 1000 }]);
  });

  it("crédit libre : aucun versement depuis N jours alors qu'il doit", () => {
    const free = facts({ type: "free" });
    expect(reminderReasons(free, stats({ balance: -5000, lastPaymentAt: "2026-09-23T12:00:00Z" }), settings, today)).toEqual([{ kind: "noRecentPayment", days: 30 }]);
    expect(reminderReasons(free, stats({ balance: -5000, lastPaymentAt: "2026-09-24T12:00:00Z" }), settings, today)).toEqual([]);
    // Jamais payé : compté depuis la première prise.
    expect(reminderReasons(free, stats({ balance: -5000, firstTakeAt: "2026-08-01T09:00:00Z" }), settings, today)).toEqual([{ kind: "noRecentPayment", days: 83 }]);
    // Ne doit rien : pas de relance.
    expect(reminderReasons(free, stats({ balance: 0, lastPaymentAt: "2026-01-01T00:00:00Z" }), settings, today)).toEqual([]);
  });
});

describe("matchesCustomer (recherche instantanée)", () => {
  const awa = { fullName: "Awa Ndiaye", phone: "+221776148991" };
  it("par nom, sans tenir compte des accents ni de la casse, dès la première lettre", () => {
    expect(matchesCustomer(awa, "a")).toBe(true);
    expect(matchesCustomer(awa, "NDIA")).toBe(true);
    expect(matchesCustomer({ fullName: "Aïssatou Bâ", phone: null }, "aissatou ba")).toBe(true);
    expect(matchesCustomer(awa, "fall")).toBe(false);
  });
  it("par numéro, avec ou sans espaces", () => {
    expect(matchesCustomer(awa, "614 89")).toBe(true);
    expect(matchesCustomer(awa, "7")).toBe(false); // un seul chiffre : trop vague
  });
});

describe("parseAmountInput", () => {
  it("accepte les espaces de milliers", () => {
    expect(parseAmountInput("25 000")).toBe(25000);
    expect(parseAmountInput("13 680")).toBe(13680);
    expect(parseAmountInput("")).toBeNull();
    expect(parseAmountInput("12,5")).toBeUndefined();
    expect(parseAmountInput("-5")).toBeUndefined();
  });
});

describe("parseCustomerInput", () => {
  it("valide la fiche et ne garde que les champs utiles au type", () => {
    expect(parseCustomerInput({ fullName: " Awa Ndiaye ", phone: "77 614 89 91", type: "monthly", creditLimit: "25 000", alertThreshold: "500", monthlyDueDay: "5", note: "" })).toEqual({
      ok: true,
      value: { fullName: "Awa Ndiaye", phone: "+221776148991", type: "monthly", creditLimit: 25000, alertThreshold: null, monthlyDueDay: 5, note: null },
    });
  });
  it("signale chaque champ invalide", () => {
    expect(parseCustomerInput({ fullName: "", phone: "123", type: "x", creditLimit: "0", monthlyDueDay: "31" })).toEqual({
      ok: false,
      fields: { fullName: "nameRequired", phone: "invalidPhone", type: "typeRequired", creditLimit: "invalidAmount", monthlyDueDay: "invalidDueDay" },
    });
  });
});

describe("groupByDay", () => {
  it("regroupe l'historique par jour local, le plus récent d'abord", () => {
    const items = [
      { id: "a", deviceCreatedAt: "2026-10-22T09:00:00Z" },
      { id: "b", deviceCreatedAt: "2026-10-23T14:32:00Z" },
      { id: "c", deviceCreatedAt: "2026-10-23T08:00:00Z" },
    ];
    expect(groupByDay(items, "Africa/Dakar")).toEqual([
      { date: "2026-10-23", items: [items[1], items[2]] },
      { date: "2026-10-22", items: [items[0]] },
    ]);
  });
});

describe("shopTotals", () => {
  it("sépare ce que les clients doivent et les avances détenues", () => {
    expect(shopTotals([{ balance: -13680 }, { balance: -2000 }, { balance: 5000 }, { balance: 0 }])).toEqual({
      owedByCustomers: 15680,
      advancesHeld: 5000,
      customersInDebt: 2,
    });
  });
});
